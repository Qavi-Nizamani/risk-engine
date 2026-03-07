import { Queue } from "bullmq";
import { getBullMqConnectionOptions } from "@risk-engine/redis";
import type { CorrelationContext, EventSeverity } from "@risk-engine/types";
import { getIngestionQueueName } from "../config/env";

export interface IngestionJobPayload {
  organizationId: string;
  projectId: string;
  source: string;
  type: string;
  severity: EventSeverity;
  payload: Record<string, unknown>;
  correlationId: string;
  correlation: CorrelationContext;
  occurredAt: string;
}

export interface EnqueueResult {
  jobId: string;
  status: "queued";
}

const queueName = getIngestionQueueName();

export const ingestionQueue = new Queue<IngestionJobPayload>(queueName, {
  connection: getBullMqConnectionOptions(),
});

export async function enqueueIngestionJob(payload: IngestionJobPayload): Promise<string> {
  const job = await ingestionQueue.add("ingest-event", payload);
  return job.id!;
}
