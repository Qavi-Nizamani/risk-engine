import type { CorrelationContext, EventSeverity } from "@risk-engine/types";
import { enqueueIngestionJob } from "../queues/ingestionQueue";
import type { EnqueueResult } from "../queues/ingestionQueue";
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

export class EventIngestionService {
  async ingest(input: IngestEventInput): Promise<EnqueueResult> {
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

    const jobId = await enqueueIngestionJob({
      organizationId: input.organizationId,
      projectId: input.projectId,
      source: input.source,
      type: input.type,
      severity: input.severity,
      payload: input.payload ?? {},
      correlationId: resolvedCorrelationId,
      correlation: resolvedCorrelation,
      occurredAt: now.toISOString(),
    });

    return { jobId, status: "queued" };
  }
}
