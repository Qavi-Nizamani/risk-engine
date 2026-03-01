import { Queue } from "bullmq";
import { getBullMqConnectionOptions } from "@risk-engine/redis";
import type { EventSeverity } from "@risk-engine/types";
import { getAnomalyQueueName } from "../config/env";

export interface AnomalyJobPayload {
  organizationId: string;
  projectId: string;
  eventId: string;
  severity: EventSeverity;
  correlationId: string;
  timestamp: number;
}

const queueName = getAnomalyQueueName();

export const anomalyQueue = new Queue<AnomalyJobPayload>(queueName, {
  connection: getBullMqConnectionOptions()
});

export async function enqueueAnomalyJob(payload: AnomalyJobPayload): Promise<void> {
  await anomalyQueue.add("anomaly-check", payload);
}
