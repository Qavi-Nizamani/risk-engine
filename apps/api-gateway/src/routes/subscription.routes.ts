import { Router } from "express";
import { z } from "zod";
import { asyncHandler, validate } from "@risk-engine/http";
import type { RequestHandler } from "express";
import type { SubscriptionController } from "../controllers/subscription.controller";

const checkoutSchema = z.object({
  planSlug: z.enum(["basic", "pro", "enterprise"]),
});

export function createSubscriptionRouter(
  ctrl: SubscriptionController,
  authenticate: RequestHandler,
): Router {
  const router = Router();

  // Public — list plans
  router.get("/billing/plans", asyncHandler(ctrl.listPlans));

  // Authenticated billing routes
  router.get("/billing/subscription", authenticate, asyncHandler(ctrl.getSubscription));
  router.post("/billing/checkout", authenticate, validate(checkoutSchema), asyncHandler(ctrl.createCheckout));
  router.post("/billing/portal", authenticate, asyncHandler(ctrl.createPortal));

  // NOTE: /webhooks/lemonsqueezy is registered separately in index.ts with express.raw()
  // before express.json() to preserve the raw body for HMAC verification.
  // Do NOT add it here or the body will already be consumed.

  return router;
}
