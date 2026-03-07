import dotenv from "dotenv";
import { resolve } from "node:path";
import { getNumberEnv } from "@risk-engine/utils";

dotenv.config({ path: resolve(__dirname, "../../../../.env") });

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL is required");
  }

  return url;
}

export function getIngestionPort(): number {
  return getNumberEnv("INGESTION_PORT", 4100);
}

export function getAnomalyQueueName(): string {
  return process.env.ANOMALY_QUEUE_NAME ?? "anomaly-detection";
}

export function getIngestionQueueName(): string {
  return process.env.INGESTION_QUEUE_NAME ?? "event-ingestion";
}
