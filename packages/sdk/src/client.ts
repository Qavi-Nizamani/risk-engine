import type {
  VigilryOptions,
  CaptureOptions,
  CaptureErrorContext,
  IngestResult,
  WireCorrelation,
  WireEventBody,
  WireServerErrorBody,
} from "./types.js";

const DEFAULT_BASE_URL = "https://ingest.vigilry.com";

function normalizeSeverity(severity: string): string {
  return severity.toUpperCase();
}

function toWireCorrelation(
  c: Record<string, string | undefined>,
): WireCorrelation {
  return {
    user_id: c["user_id"],
    customer_id: c["customer_id"],
    order_id: c["order_id"],
    payment_provider: c["payment_provider"],
    plan: c["plan"],
    deployment_id: c["deployment_id"],
  };
}

export class Vigilry {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: VigilryOptions) {
    if (!options.apiKey) {
      throw new Error("[Vigilry] apiKey is required");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  async capture(options: CaptureOptions): Promise<IngestResult | null> {
    const body: WireEventBody = {
      type: "manual",
      source: options.type,
      severity: normalizeSeverity(options.severity),
      payload: { message: options.message },
      ...(options.correlation
        ? { correlation: toWireCorrelation(options.correlation) }
        : {}),
    };
    return this.post<IngestResult>("/ingest/events", body);
  }

  async captureError(
    error: Error,
    context: CaptureErrorContext = {},
  ): Promise<IngestResult | null> {
    const body: WireServerErrorBody = {
      status_code: context.status_code ?? 500,
      path: context.path ?? "unknown",
      method: context.method ?? "unknown",
      error_message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
      ...(context.correlation
        ? { correlation: toWireCorrelation(context.correlation) }
        : {}),
    };
    return this.post<IngestResult>("/ingest/server-error", body);
  }

  private async post<T>(path: string, body: unknown): Promise<T | null> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": this.apiKey,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        console.error(
          `[Vigilry] Ingestion failed: ${response.status} ${response.statusText} on ${path}`,
        );
        return null;
      }

      return (await response.json()) as T;
    } catch (err) {
      console.error("[Vigilry] Network error during ingestion:", err);
      return null;
    }
  }
}
