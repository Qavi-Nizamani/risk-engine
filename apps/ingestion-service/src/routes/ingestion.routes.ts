import { Router } from "express";
import { z } from "zod";
import { asyncHandler, validate } from "@risk-engine/http";
import type { RequestHandler } from "express";
import { EventSeverity, EventType } from "@risk-engine/types";
import type { IngestionController } from "../controllers/ingestion.controller";

const correlationSchema = z
  .object({
    user_id: z.string().optional(),
    customer_id: z.string().optional(),
    order_id: z.string().optional(),
    payment_provider: z.string().optional(),
    plan: z.string().optional(),
    deployment_id: z.string().optional(),
  })
  .optional();

const manualEventSchema = z.object({
  type: z.enum(Object.values(EventType) as [string, ...string[]]),
  source: z.string().min(1),
  severity: z.enum(Object.values(EventSeverity) as [string, ...string[]]),
  payload: z.record(z.unknown()).optional(),
  correlation_id: z.string().optional(),
  correlation: correlationSchema,
  occurred_at: z.string().optional(),
});

const serverErrorSchema = z.object({
  status_code: z.number().int().min(500),
  path: z.string().min(1),
  method: z.string().min(1),
  error_message: z.string().min(1),
  stack: z.string().optional(),
  correlation_id: z.string().optional(),
  correlation: correlationSchema,
});

const webhookSchema = z.object({
  type: z.string().min(1),
  source: z.string().min(1),
  severity: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
  correlation_id: z.string().optional(),
  correlation: correlationSchema,
});

export function createIngestionRouter(
  ctrl: IngestionController,
  authenticate: RequestHandler,
): Router {
  const router = Router();

  router.post(
    "/ingest/events",
    authenticate,
    validate(manualEventSchema),
    asyncHandler(ctrl.ingestManual),
  );
  router.post(
    "/ingest/server-error",
    authenticate,
    validate(serverErrorSchema),
    asyncHandler(ctrl.ingestServerError),
  );
  router.post(
    "/ingest/webhook",
    authenticate,
    validate(webhookSchema),
    asyncHandler(ctrl.ingestWebhook),
  );
  router.post("/ingest/stripe", authenticate, asyncHandler(ctrl.ingestStripe));

  return router;
}
