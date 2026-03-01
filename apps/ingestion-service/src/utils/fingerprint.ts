import { createHash } from "node:crypto";
import type { CorrelationContext } from "@risk-engine/types";

export function computeCorrelationFingerprint(
  projectId: string,
  type: string,
  source: string,
  correlation: CorrelationContext,
): string {
  const contextPart = Object.entries(correlation)
    .filter(([, v]) => typeof v === "string" && v !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(":");

  const raw = `${projectId}:${type}:${source}:${contextPart}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}
