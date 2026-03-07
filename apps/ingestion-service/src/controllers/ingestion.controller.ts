import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { createLogger } from "@risk-engine/logger";
import { EventSeverity, EventType } from "@risk-engine/types";
import type { CorrelationContext } from "@risk-engine/types";
import { BadRequestError, UnauthorizedError } from "@risk-engine/http";
import type { EventIngestionService } from "../services/eventIngestion.service";

const logger = createLogger("ingestion-service");

function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const expectedBuf = Buffer.from(`sha256=${expected}`);
  const signatureBuf = Buffer.from(signature);
  if (expectedBuf.length !== signatureBuf.length) return false;
  return timingSafeEqual(expectedBuf, signatureBuf);
}

function verifyStripeSignature(payload: string, signature: string, secret: string): boolean {
  const parts = Object.fromEntries(
    signature.split(",").map((p) => p.split("=") as [string, string]),
  );
  const timestamp = parts["t"];
  const v1 = parts["v1"];
  if (!timestamp || !v1) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const v1Buf = Buffer.from(v1);
  if (expectedBuf.length !== v1Buf.length) return false;
  return timingSafeEqual(expectedBuf, v1Buf);
}

function mapStripeEventType(stripeType: string): { type: EventType; severity: EventSeverity } {
  if (
    stripeType.startsWith("payment_intent.payment_failed") ||
    stripeType.startsWith("charge.failed")
  ) {
    return { type: EventType.PAYMENT_FAILURE, severity: EventSeverity.ERROR };
  }
  if (
    stripeType.startsWith("charge.refunded") ||
    stripeType.startsWith("refund.created")
  ) {
    return { type: EventType.REFUND_SPIKE, severity: EventSeverity.WARN };
  }
  return { type: EventType.WEBHOOK, severity: EventSeverity.INFO };
}

export class IngestionController {
  constructor(private readonly service: EventIngestionService) {}

  ingestManual = async (req: Request, res: Response): Promise<void> => {
    const {
      type,
      source,
      severity,
      payload,
      correlation_id,
      correlation,
      occurred_at,
    } = req.body as {
      type: string;
      source: string;
      severity: string;
      payload?: Record<string, unknown>;
      correlation_id?: string;
      correlation?: CorrelationContext;
      occurred_at?: string;
    };

    if (!Object.values(EventType).includes(type as EventType)) {
      throw new BadRequestError(
        `type must be one of: ${Object.values(EventType).join(", ")}`,
      );
    }

    const result = await this.service.ingest({
      organizationId: req.auth.organization.id,
      projectId: req.auth.project.id,
      source,
      type,
      severity: severity as EventSeverity,
      payload,
      correlationId: correlation_id,
      correlation,
      occurredAt: occurred_at ? new Date(occurred_at) : undefined,
    });

    logger.info(
      { organizationId: req.auth.organization.id, jobId: result.jobId, type },
      "Manual event ingested",
    );

    res.status(202).json(result);
  };

  ingestServerError = async (req: Request, res: Response): Promise<void> => {
    const {
      status_code,
      path,
      method,
      error_message,
      stack,
      correlation_id,
      correlation,
    } = req.body as {
      status_code: number;
      path: string;
      method: string;
      error_message: string;
      stack?: string;
      correlation_id?: string;
      correlation?: CorrelationContext;
    };

    if (status_code < 500) {
      throw new BadRequestError("status_code must be 500 or higher");
    }

    const severity = status_code >= 504 ? EventSeverity.CRITICAL : EventSeverity.ERROR;
    const eventPayload: Record<string, unknown> = { status_code, path, method, error_message };
    if (stack) eventPayload.stack = stack;

    const result = await this.service.ingest({
      organizationId: req.auth.organization.id,
      projectId: req.auth.project.id,
      source: "server-monitoring",
      type: EventType.SERVER_ERROR,
      severity,
      payload: eventPayload,
      correlationId: correlation_id,
      correlation,
    });

    logger.info(
      { organizationId: req.auth.organization.id, jobId: result.jobId, status_code, severity },
      "Server error event ingested",
    );

    res.status(202).json(result);
  };

  ingestWebhook = async (req: Request, res: Response): Promise<void> => {
    const webhookSecret = process.env.WEBHOOK_SECRET;
    const signature = req.headers["x-webhook-signature"];

    if (webhookSecret && signature && typeof signature === "string") {
      const rawBody = JSON.stringify(req.body);
      if (!verifySignature(rawBody, signature, webhookSecret)) {
        throw new UnauthorizedError("Invalid webhook signature");
      }
    }

    const {
      type,
      source,
      severity,
      payload,
      correlation_id,
      correlation,
    } = req.body as {
      type: string;
      source: string;
      severity?: string;
      payload?: Record<string, unknown>;
      correlation_id?: string;
      correlation?: CorrelationContext;
    };

    const resolvedSeverity = (
      severity && Object.values(EventSeverity).includes(severity as EventSeverity)
        ? severity
        : EventSeverity.INFO
    ) as EventSeverity;

    const result = await this.service.ingest({
      organizationId: req.auth.organization.id,
      projectId: req.auth.project.id,
      source,
      type,
      severity: resolvedSeverity,
      payload,
      correlationId: correlation_id,
      correlation,
    });

    logger.info(
      { organizationId: req.auth.organization.id, jobId: result.jobId, type },
      "Webhook event ingested",
    );

    res.status(202).json(result);
  };

  ingestStripe = async (req: Request, res: Response): Promise<void> => {
    const stripeSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const signature = req.headers["stripe-signature"];

    if (stripeSecret) {
      if (!signature || typeof signature !== "string") {
        throw new UnauthorizedError("stripe-signature header is required");
      }
      const rawBody = JSON.stringify(req.body);
      if (!verifyStripeSignature(rawBody, signature, stripeSecret)) {
        throw new UnauthorizedError("Invalid Stripe webhook signature");
      }
    }

    const stripeEvent = req.body as {
      id?: string;
      type?: string;
      data?: { object?: Record<string, unknown> };
    };

    const stripeType = stripeEvent.type ?? "unknown";
    const { type, severity } = mapStripeEventType(stripeType);
    const stripeObject = stripeEvent.data?.object ?? {};

    const correlationId =
      typeof stripeObject["payment_intent"] === "string"
        ? stripeObject["payment_intent"]
        : typeof stripeObject["id"] === "string"
          ? stripeObject["id"]
          : stripeEvent.id;

    const stripeCorrelation: CorrelationContext = {
      payment_provider: "stripe",
      ...(typeof stripeObject["customer"] === "string"
        ? { customer_id: stripeObject["customer"] }
        : {}),
    };

    const result = await this.service.ingest({
      organizationId: req.auth.organization.id,
      projectId: req.auth.project.id,
      source: "stripe",
      type,
      severity,
      payload: {
        stripe_event_type: stripeType,
        stripe_event_id: stripeEvent.id,
        ...stripeObject,
      },
      correlationId: typeof correlationId === "string" ? correlationId : undefined,
      correlation: stripeCorrelation,
    });

    logger.info(
      { organizationId: req.auth.organization.id, jobId: result.jobId, stripeType, type },
      "Stripe event ingested",
    );

    res.status(202).json(result);
  };

  ingestTokenWebhook = async (req: Request, res: Response): Promise<void> => {
    const rawBody = req.body as Buffer;
    const parsed = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
    const endpointName = req.auth.webhookEndpoint?.name ?? "webhook";
    const source = endpointName.toLowerCase().replace(/\s+/g, "-");

    // Extract correlation context from common webhook payload shapes.
    // Lemon Squeezy: meta.custom_data.{user_id, plan_code, tenant_id}, data.attributes.{customer_id, order_number}
    const meta = typeof parsed.meta === "object" && parsed.meta !== null
      ? (parsed.meta as Record<string, unknown>)
      : {};
    const customData = typeof meta.custom_data === "object" && meta.custom_data !== null
      ? (meta.custom_data as Record<string, unknown>)
      : {};
    const dataAttrs = typeof parsed.data === "object" && parsed.data !== null
      ? ((parsed.data as Record<string, unknown>).attributes as Record<string, unknown> | undefined ?? {})
      : {};

    const correlation: CorrelationContext = {
      payment_provider: source,
      ...(typeof customData.user_id === "string" ? { user_id: customData.user_id } : {}),
      ...(typeof customData.tenant_id === "string" ? { customer_id: customData.tenant_id } : {}),
      ...(typeof dataAttrs.customer_id === "number" ? { customer_id: String(dataAttrs.customer_id) } : {}),
      ...(typeof dataAttrs.order_number === "number" ? { order_id: String(dataAttrs.order_number) } : {}),
      ...(typeof customData.plan_code === "string" ? { plan: customData.plan_code } : {}),
    };

    const result = await this.service.ingest({
      organizationId: req.auth.organization.id,
      projectId: req.auth.project.id,
      source,
      type: EventType.WEBHOOK,
      severity: EventSeverity.INFO,
      payload: parsed,
      correlation,
    });

    logger.info(
      { organizationId: req.auth.organization.id, jobId: result.jobId, source },
      "Token webhook event ingested",
    );

    res.status(202).json(result);
  };
}
