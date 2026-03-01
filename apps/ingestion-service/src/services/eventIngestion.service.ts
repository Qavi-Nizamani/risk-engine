import type { CorrelationContext, EventSeverity } from "@risk-engine/types";
import { getRedisClient } from "@risk-engine/redis";
import { emitEventIngested } from "@risk-engine/events";
import type { RedisStreamClient } from "@risk-engine/events";
import { enqueueAnomalyJob } from "../queues/anomalyQueue";
import type { EventIngestionRepository } from "../repositories/event.repository";
import { computeCorrelationFingerprint } from "../utils/fingerprint";

export interface IngestEventInput {
  organizationId: string;
  projectId: string;
  source: string;
  type: string;
  severity: EventSeverity;
  payload?: Record<string, unknown>;
  correlationId?: string;
  correlation?: CorrelationContext;
  occurredAt?: Date;
}

export interface IngestEventResult {
  id: string;
  organizationId: string;
  projectId: string;
  source: string;
  type: string;
  severity: string;
  correlationId: string;
  correlation: CorrelationContext;
  occurredAt: string;
}

export class EventIngestionService {
  private readonly streamClient: RedisStreamClient;

  constructor(private readonly eventRepo: EventIngestionRepository) {
    this.streamClient = getRedisClient() as unknown as RedisStreamClient;
  }

  async ingest(input: IngestEventInput): Promise<IngestEventResult> {
    const now = input.occurredAt ?? new Date();
    const resolvedCorrelation = input.correlation ?? {};
    const resolvedCorrelationId =
      input.correlationId ??
      computeCorrelationFingerprint(
        input.projectId,
        input.type,
        input.source,
        resolvedCorrelation,
      );

    const event = await this.eventRepo.insert({
      organizationId: input.organizationId,
      projectId: input.projectId,
      source: input.source,
      type: input.type,
      severity: input.severity as "INFO" | "WARN" | "ERROR" | "CRITICAL",
      payload: (input.payload ?? {}) as Record<string, unknown>,
      correlationId: resolvedCorrelationId,
      correlation: resolvedCorrelation,
      occurredAt: now,
    });

    const occurredAtMs = event.occurredAt.getTime();

    await emitEventIngested(this.streamClient, {
      organizationId: input.organizationId,
      projectId: input.projectId,
      eventId: event.id,
      type: event.type,
      source: event.source,
      severity: input.severity,
      payload: event.payload,
      occurredAt: event.occurredAt.toISOString(),
      timestamp: occurredAtMs,
    });

    await enqueueAnomalyJob({
      organizationId: input.organizationId,
      projectId: input.projectId,
      eventId: event.id,
      severity: input.severity,
      correlationId: resolvedCorrelationId,
      timestamp: occurredAtMs,
    });

    return {
      id: event.id,
      organizationId: event.organizationId,
      projectId: event.projectId,
      source: event.source,
      type: event.type,
      severity: event.severity,
      correlationId: resolvedCorrelationId,
      correlation: resolvedCorrelation,
      occurredAt: event.occurredAt.toISOString(),
    };
  }
}
