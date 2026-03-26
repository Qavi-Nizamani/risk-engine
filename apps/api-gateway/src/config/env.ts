import dotenv from "dotenv";
import { resolve } from "node:path";
import { getNumberEnv } from "@risk-engine/utils";

dotenv.config({ path: resolve(__dirname, "../../../../.env") });

export function getApiGatewayPort(): number {
  return getNumberEnv("API_GATEWAY_PORT", 4000);
}

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL is required");
  }

  return url;
}

export function getRedisStreamName(): string {
  return process.env.REDIS_STREAM_NAME ?? "platform-events";
}

export function getRiskQueueName(): string {
  return process.env.ANOMALY_QUEUE_NAME ?? "risk-scoring";
}

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is required");
  }

  return secret;
}

export function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN ?? "http://localhost:3000";
}

export function getIngestionBaseUrl(): string {
  return process.env.INGESTION_BASE_URL ?? "http://localhost:4100";
}

export function isSignupDisabled(): boolean {
  return process.env.SIGNUP_DISABLED === "true";
}

export function getDashboardUrl(): string {
  return process.env.DASHBOARD_URL ?? "http://localhost:3000";
}

export function getLemonSqueezyApiKey(): string {
  return process.env.LEMONSQUEEZY_API_KEY ?? "";
}

export function getLemonSqueezyStoreId(): string {
  return process.env.LEMONSQUEEZY_STORE_ID ?? "";
}

export function getLemonSqueezyWebhookSecret(): string {
  return process.env.LEMONSQUEEZY_WEBHOOK_SECRET ?? "";
}
