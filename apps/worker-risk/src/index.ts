import http from "node:http";
import { and, eq, gte, lte, desc, sql } from "drizzle-orm";
import { Worker, Queue } from "bullmq";
import { createLogger } from "@risk-engine/logger";
import { getBullMqConnectionOptions, getRedisClient } from "@risk-engine/redis";
import {
  EventSeverity,
  IncidentSeverity,
  IncidentStatus,
} from "@risk-engine/types";
import { getDb, events, incidents, incidentEvents } from "@risk-engine/db";
import {
  getAnomalyQueueName,
  getDatabaseUrl,
  getIngestionQueueName,
  getWorkerPort,
} from "./config/env";
import {
  emitAnomalyDetected,
  emitEventIngested,
  emitIncidentCreated,
  emitIncidentUpdated,
  type RedisStreamClient,
} from "@risk-engine/events";

interface AnomalyJobPayload {
  organizationId: string;
  projectId: string;
  eventId: string;
  severity: EventSeverity;
  correlationId: string;
  timestamp: number;
}

const logger = createLogger("worker-anomaly");

// Dev-friendly short TTLs — bump these for production
const ACTIVE_INCIDENT_TTL_SECONDS = 60; // errors must keep coming to stay OPEN
const INVESTIGATING_INCIDENT_TTL_SECONDS = 300; // full quiet window; resets on re-spike
const LOCK_TTL_MS = 10_000; // incident creation lock
const SWEEP_LOCK_TTL_MS = 20_000; // per-incident sweep lock (> sweep interval of 10 s)
const RESOLVE_THRESHOLD_MS = 45_000; // resolve within last 15 s of investigating TTL

/**
 * Lua: atomically read PTTL and conditionally delete the key.
 *
 * Returns:
 *  -2  → key already gone (expired between SCAN and this call) — skip
 *   0  → TTL was within threshold; key deleted — caller should resolve
 *  >0  → TTL still high in ms — caller should skip and check next sweep
 */
const CHECK_AND_DELETE_LUA = `
local ttl = redis.call('PTTL', KEYS[1])
if ttl == -2 then return -2 end
if ttl <= tonumber(ARGV[1]) then
  redis.call('DEL', KEYS[1])
  return 0
end
return ttl
`;

// ── Redis key helpers ────────────────────────────────────────────────────────

function buildActiveIncidentKey(
  organizationId: string,
  projectId: string,
): string {
  return `incident:active:${organizationId}:${projectId}`;
}

function buildInvestigatingKey(
  organizationId: string,
  projectId: string,
): string {
  return `incident:investigating:${organizationId}:${projectId}`;
}

function buildLockKey(organizationId: string, projectId: string): string {
  return `lock:incident:create:${organizationId}:${projectId}`;
}

function buildSweepLockKey(incidentId: string): string {
  return `lock:sweep:${incidentId}`;
}

// ── Value encoding ───────────────────────────────────────────────────────────

/**
 * Stored value format: "<incidentId>|<status>|<createdAt ISO>"
 * Pipe separator avoids collision with ISO timestamp colons.
 */
function encodeIncidentValue(
  incidentId: string,
  status: IncidentStatus,
  createdAt: string,
): string {
  return `${incidentId}|${status}|${createdAt}`;
}

function decodeIncidentValue(value: string): {
  incidentId: string;
  status: IncidentStatus;
  createdAt: string;
} {
  const [incidentId, status, createdAt] = value.split("|");
  return { incidentId, status: status as IncidentStatus, createdAt };
}

// ── Redis SCAN (non-blocking, safe at scale) ─────────────────────────────────

async function scanKeys(
  redisClient: ReturnType<typeof getRedisClient>,
  pattern: string,
): Promise<string[]> {
  const keys: string[] = [];
  let cursor = 0;
  do {
    const [next, batch] = await redisClient.scan(
      cursor,
      "MATCH",
      pattern,
      "COUNT",
      100,
    );
    cursor = Number(next);
    keys.push(...batch);
  } while (cursor !== 0);
  return keys;
}

// ── Health server ────────────────────────────────────────────────────────────

function startHealthServer(): void {
  const port = getWorkerPort();
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        service: "worker-anomaly",
        timestamp: new Date().toISOString(),
      }),
    );
  });
  server.listen(port, () =>
    logger.info({ port }, "Worker health server listening"),
  );
}

// ── Sweep ────────────────────────────────────────────────────────────────────

/**
 * State machine driven by two Redis keys:
 *
 *  incident:active:{org}:{project}       → refreshed on every anomaly hit; expiry = OPEN→quiet
 *  incident:investigating:{org}:{project} → fixed TTL from creation; resets on re-spike
 *
 * Transitions per sweep tick (10 s):
 *
 *  status=OPEN   + active present  → still OPEN, skip
 *  status=OPEN   + active absent   → DB: INVESTIGATING, update Redis value (KEEPTTL)
 *  status=INVESTIGATING + active present  → re-spike; DB: OPEN, refresh both keys
 *  status=INVESTIGATING + active absent   → wait until PTTL ≤ 15 s, then DB: RESOLVED
 *
 * Hardening:
 *  • SCAN instead of KEYS — non-blocking
 *  • Per-incident sweep lock — prevents concurrent workers from double-processing
 *  • Lua PTTL+DEL — atomic; avoids race between check and delete
 *  • try/catch per incident — one failure never aborts the whole sweep
 */
async function runSweep(
  redisClient: ReturnType<typeof getRedisClient>,
  streamClient: RedisStreamClient,
  db: ReturnType<typeof getDb>,
): Promise<void> {
  const investigatingKeys = await scanKeys(
    redisClient,
    "incident:investigating:*",
  );
  if (investigatingKeys.length === 0) return;

  for (const investigatingKey of investigatingKeys) {
    const raw = await redisClient.get(investigatingKey);
    if (raw === null) continue; // expired between SCAN and GET

    const { incidentId, status, createdAt } = decodeIncidentValue(raw);
    const parts = investigatingKey.split(":");
    const organizationId = parts[2];
    const projectId = parts[3];

    // Per-incident sweep lock — skip if another worker is already processing this incident
    const sweepLockKey = buildSweepLockKey(incidentId);
    const sweepLockAcquired = await redisClient.set(
      sweepLockKey,
      "1",
      "PX",
      SWEEP_LOCK_TTL_MS,
      "NX",
    );
    if (sweepLockAcquired === null) continue;

    try {
      const activeKey = buildActiveIncidentKey(organizationId, projectId);
      const activeRaw = await redisClient.get(activeKey);

      if (activeRaw !== null) {
        // Spike is still ongoing — if Redis cached an INVESTIGATING status, correct it back to OPEN
        if (status === IncidentStatus.INVESTIGATING) {
          await db
            .update(incidents)
            .set({ status: IncidentStatus.OPEN, updatedAt: sql`now()` })
            .where(
              and(
                eq(incidents.id, incidentId),
                eq(incidents.status, IncidentStatus.INVESTIGATING),
              ),
            );

          await redisClient.set(
            activeKey,
            encodeIncidentValue(incidentId, IncidentStatus.OPEN, createdAt),
            "KEEPTTL",
          );
          await redisClient.set(
            investigatingKey,
            encodeIncidentValue(incidentId, IncidentStatus.OPEN, createdAt),
            "KEEPTTL",
          );

          await emitIncidentUpdated(streamClient, {
            id: incidentId,
            organizationId,
            projectId,
            status: IncidentStatus.OPEN,
            severity: IncidentSeverity.CRITICAL as unknown as EventSeverity,
            createdAt,
          });

          logger.info(
            { organizationId, incidentId },
            "Re-spike detected in sweep → back to OPEN",
          );
        }
        continue;
      }

      // No active key — errors have calmed down
      if (status === IncidentStatus.OPEN) {
        // First quiet sweep: transition to INVESTIGATING
        await db
          .update(incidents)
          .set({ status: IncidentStatus.INVESTIGATING, updatedAt: sql`now()` })
          .where(
            and(
              eq(incidents.id, incidentId),
              eq(incidents.status, IncidentStatus.OPEN),
            ),
          );

        await redisClient.set(
          investigatingKey,
          encodeIncidentValue(
            incidentId,
            IncidentStatus.INVESTIGATING,
            createdAt,
          ),
          "KEEPTTL",
        );

        await emitIncidentUpdated(streamClient, {
          id: incidentId,
          organizationId,
          projectId,
          status: IncidentStatus.INVESTIGATING,
          severity: IncidentSeverity.CRITICAL as unknown as EventSeverity,
          createdAt,
        });

        logger.info(
          { organizationId, incidentId },
          "Errors calmed → INVESTIGATING",
        );
      } else if (status === IncidentStatus.INVESTIGATING) {
        // Lua atomically checks PTTL and deletes the key if within resolve threshold.
        // This eliminates the race between pttl() and del() across concurrent workers.
        const result = (await redisClient.eval(
          CHECK_AND_DELETE_LUA,
          1,
          investigatingKey,
          String(RESOLVE_THRESHOLD_MS),
        )) as number;

        if (result === -2) continue; // key already gone — nothing to do
        if (result > 0) continue; // TTL still high — check again on next sweep

        // result === 0: key deleted by Lua, safe to resolve
        await db
          .update(incidents)
          .set({ status: IncidentStatus.RESOLVED, updatedAt: sql`now()` })
          .where(
            and(
              eq(incidents.id, incidentId),
              eq(incidents.status, IncidentStatus.INVESTIGATING),
            ),
          );

        await emitIncidentUpdated(streamClient, {
          id: incidentId,
          organizationId,
          projectId,
          status: IncidentStatus.RESOLVED,
          severity: IncidentSeverity.CRITICAL as unknown as EventSeverity,
          createdAt,
        });

        logger.info(
          { organizationId, incidentId },
          "INVESTIGATING window closed → RESOLVED",
        );
      }
    } catch (err) {
      // Log with full context so the incident can be manually recovered if needed.
      // The sweep lock expires in SWEEP_LOCK_TTL_MS, after which the next sweep retries.
      logger.error(
        { organizationId, incidentId, status, err },
        "Sweep transition failed — will retry on next tick",
      );
    } finally {
      await redisClient.del(sweepLockKey);
    }
  }
}

// ── Health check worker ──────────────────────────────────────────────────────

async function incidentHealthCheckWorker(): Promise<void> {
  const redisClient = getRedisClient();
  const connection = getBullMqConnectionOptions();
  const streamClient: RedisStreamClient =
    redisClient as unknown as RedisStreamClient;
  const db = getDb(getDatabaseUrl());

  new Worker(
    "incident_health_check",
    async () => {
      await runSweep(redisClient, streamClient, db);
    },
    { connection },
  );
}

// ── Anomaly worker ───────────────────────────────────────────────────────────

async function runWorker(): Promise<void> {
  const queueName = getAnomalyQueueName();
  const connection = getBullMqConnectionOptions();
  const redisClient = getRedisClient();
  const streamClient: RedisStreamClient =
    redisClient as unknown as RedisStreamClient;
  const db = getDb(getDatabaseUrl());

  const worker = new Worker<AnomalyJobPayload>(
    queueName,
    async (job) => {
      const { organizationId, projectId, timestamp } = job.data;

      const windowMs = 60 * 1000;
      const windowStart = new Date(timestamp - windowMs);

      const recentErrors = await db
        .select()
        .from(events)
        .where(
          and(
            eq(events.organizationId, organizationId),
            eq(events.projectId, projectId),
            eq(events.severity, EventSeverity.ERROR),
            gte(events.occurredAt, windowStart),
            lte(events.occurredAt, new Date(timestamp)),
          ),
        )
        .orderBy(desc(events.occurredAt));

      const errorCount = recentErrors.length;

      if (errorCount <= 0) {
        logger.info(
          { organizationId, errorCount },
          "Error rate below anomaly threshold",
        );
        return;
      }

      await emitAnomalyDetected(streamClient, {
        organizationId,
        projectId,
        errorCount,
        windowSeconds: 60,
      });

      const activeKey = buildActiveIncidentKey(organizationId, projectId);
      const activeRaw: string | null = await redisClient.get(activeKey);

      // ── PATH A: Active incident — attach events, refresh TTL ─────────────────
      if (activeRaw !== null) {
        const { incidentId: activeIncidentId } = decodeIncidentValue(activeRaw);
        const relatedEvents = recentErrors.slice(0, 10);
        if (relatedEvents.length > 0) {
          await db
            .insert(incidentEvents)
            .values(
              relatedEvents.map((e) => ({
                incidentId: activeIncidentId,
                eventId: e.id,
              })),
            )
            .onConflictDoNothing();
        }
        await redisClient.expire(activeKey, ACTIVE_INCIDENT_TTL_SECONDS);

        logger.info(
          {
            organizationId,
            incidentId: activeIncidentId,
            attachedCount: relatedEvents.length,
          },
          "Attached events to existing incident, refreshed active TTL",
        );
        return;
      }

      const investigatingKey = buildInvestigatingKey(organizationId, projectId);
      const investigatingRaw = await redisClient.get(investigatingKey);

      // ── PATH B: Re-spike during INVESTIGATING — reinstate active key, reset quiet window ──
      if (investigatingRaw !== null) {
        const {
          incidentId: investigatingIncidentId,
          createdAt: investigatingCreatedAt,
        } = decodeIncidentValue(investigatingRaw);
        const relatedEvents = recentErrors.slice(0, 10);
        if (relatedEvents.length > 0) {
          await db
            .insert(incidentEvents)
            .values(
              relatedEvents.map((e) => ({
                incidentId: investigatingIncidentId,
                eventId: e.id,
              })),
            )
            .onConflictDoNothing();
        }

        // Reinstate the active key (fresh TTL)
        await redisClient.set(
          activeKey,
          encodeIncidentValue(
            investigatingIncidentId,
            IncidentStatus.OPEN,
            investigatingCreatedAt,
          ),
          "EX",
          ACTIVE_INCIDENT_TTL_SECONDS,
        );
        // Reset investigating TTL to full value so the quiet window restarts from now
        await redisClient.set(
          investigatingKey,
          encodeIncidentValue(
            investigatingIncidentId,
            IncidentStatus.OPEN,
            investigatingCreatedAt,
          ),
          "EX",
          INVESTIGATING_INCIDENT_TTL_SECONDS,
        );

        await db
          .update(incidents)
          .set({ status: IncidentStatus.OPEN, updatedAt: sql`now()` })
          .where(eq(incidents.id, investigatingIncidentId));

        await emitIncidentUpdated(streamClient, {
          id: investigatingIncidentId,
          organizationId,
          projectId,
          status: IncidentStatus.OPEN,
          severity: IncidentSeverity.CRITICAL as unknown as EventSeverity,
          createdAt: investigatingCreatedAt,
        });

        logger.info(
          { organizationId, incidentId: investigatingIncidentId },
          "Re-spike during INVESTIGATING → active key reinstated, quiet window reset",
        );
        return;
      }

      // ── PATH C: No active, no investigating — create new incident ────────────
      const lockKey = buildLockKey(organizationId, projectId);
      const lockAcquired = await redisClient.set(
        lockKey,
        "1",
        "PX",
        LOCK_TTL_MS,
        "NX",
      );

      if (lockAcquired === null) {
        logger.info(
          { organizationId, projectId },
          "Lock held by concurrent job, skipping incident creation",
        );
        return;
      }

      const relatedEvents = recentErrors.slice(0, 10);

      const [incident] = await db
        .insert(incidents)
        .values({
          organizationId,
          projectId,
          status: IncidentStatus.OPEN,
          severity: IncidentSeverity.CRITICAL,
          summary: `High error rate detected: ${errorCount} ERROR events in last 60 seconds.`,
        })
        .returning();

      if (relatedEvents.length > 0) {
        await db.insert(incidentEvents).values(
          relatedEvents.map((e) => ({
            incidentId: incident.id,
            eventId: e.id,
          })),
        );
      }

      const incidentCreatedAt = incident.createdAt.toISOString();

      // Active key: refreshed while errors keep arriving
      await redisClient.set(
        activeKey,
        encodeIncidentValue(
          incident.id,
          IncidentStatus.OPEN,
          incidentCreatedAt,
        ),
        "EX",
        ACTIVE_INCIDENT_TTL_SECONDS,
      );
      // Investigating key: drives the quiet window; reset on every re-spike
      await redisClient.set(
        investigatingKey,
        encodeIncidentValue(
          incident.id,
          IncidentStatus.OPEN,
          incidentCreatedAt,
        ),
        "EX",
        INVESTIGATING_INCIDENT_TTL_SECONDS,
      );

      await emitIncidentCreated(streamClient, {
        id: incident.id,
        organizationId,
        projectId,
        status: incident.status as IncidentStatus,
        severity: incident.severity as EventSeverity,
        summary: incident.summary,
        createdAt: incidentCreatedAt,
      });

      logger.info(
        { organizationId, incidentId: incident.id, errorCount },
        "Created new incident from anomaly",
      );
    },
    { connection },
  );

  worker.on("failed", (job, error) =>
    logger.error({ jobId: job?.id, error }, "Anomaly worker job failed"),
  );
  worker.on("completed", (job) =>
    logger.info({ jobId: job.id }, "Anomaly worker job completed"),
  );
}

// ── Ingestion worker ─────────────────────────────────────────────────────────

interface IngestionJobPayload {
  organizationId: string;
  projectId: string;
  source: string;
  type: string;
  severity: EventSeverity;
  payload: Record<string, unknown>;
  correlationId: string;
  correlation: Record<string, unknown>;
  occurredAt: string;
}

async function runIngestionWorker(): Promise<void> {
  const queueName = getIngestionQueueName();
  const anomalyQueueName = getAnomalyQueueName();
  const connection = getBullMqConnectionOptions();
  const redisClient = getRedisClient();
  const streamClient: RedisStreamClient = redisClient as unknown as RedisStreamClient;
  const db = getDb(getDatabaseUrl());
  const anomalyQueue = new Queue<AnomalyJobPayload>(anomalyQueueName, { connection });

  const worker = new Worker<IngestionJobPayload>(
    queueName,
    async (job) => {
      const { organizationId, projectId, source, type, severity, payload, correlationId, correlation, occurredAt } = job.data;

      const occurredAtDate = new Date(occurredAt);

      const [event] = await db
        .insert(events)
        .values({
          organizationId,
          projectId,
          source,
          type,
          severity: severity as "INFO" | "WARN" | "ERROR" | "CRITICAL",
          payload,
          correlationId,
          correlation,
          occurredAt: occurredAtDate,
        })
        .returning();

      const occurredAtMs = event.occurredAt.getTime();

      await emitEventIngested(streamClient, {
        organizationId,
        projectId,
        eventId: event.id,
        type: event.type,
        source: event.source,
        severity,
        payload: event.payload,
        occurredAt: event.occurredAt.toISOString(),
        timestamp: occurredAtMs,
      });

      await anomalyQueue.add("anomaly-check", {
        organizationId,
        projectId,
        eventId: event.id,
        severity,
        correlationId,
        timestamp: occurredAtMs,
      });

      logger.info({ organizationId, projectId, eventId: event.id, type }, "Event ingested");
    },
    { connection },
  );

  worker.on("failed", (job, error) =>
    logger.error({ jobId: job?.id, error }, "Ingestion worker job failed"),
  );
  worker.on("completed", (job) =>
    logger.info({ jobId: job.id }, "Ingestion worker job completed"),
  );
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  try {
    startHealthServer();
    await runIngestionWorker();
    await runWorker();
    await incidentHealthCheckWorker();

    const connection = getBullMqConnectionOptions();
    const queue = new Queue("incident_health_check", { connection });

    await queue.upsertJobScheduler(
      "incident-health-check",
      { every: 10_000 },
      { name: "cron-health-check", data: {}, opts: {} },
    );
  } catch (err) {
    console.error("WORKER CRASH:", err);
    process.exit(1);
  }
}

bootstrap().catch((error) => {
  logger.error({ error }, "Worker failed to start");
  process.exit(1);
});
