import type { Request, Response } from "express";
import { createLogger } from "@risk-engine/logger";
import type { SubscriptionService } from "../services/subscription.service";

const logger = createLogger("api-gateway:subscription");

export class SubscriptionController {
  constructor(private readonly subService: SubscriptionService) {}

  /** GET /billing/plans — public, list all active plans */
  listPlans = async (_req: Request, res: Response): Promise<void> => {
    const plans = await this.subService.listPlans();
    res.json(
      plans.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        priceMonthyCents: p.priceMonthyCents,
        maxProjects: p.maxProjects,
        maxMembers: p.maxMembers,
      })),
    );
  };

  /** GET /billing/subscription — current org subscription */
  getSubscription = async (req: Request, res: Response): Promise<void> => {
    const { subscription, plan } = await this.subService.getSubscription(req.auth.organization.id);
    res.json({
      id: subscription.id,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
      plan: {
        id: plan.id,
        name: plan.name,
        slug: plan.slug,
        priceMonthyCents: plan.priceMonthyCents,
        maxProjects: plan.maxProjects,
        maxMembers: plan.maxMembers,
      },
    });
  };

  /** POST /billing/checkout — create Lemon Squeezy checkout URL */
  createCheckout = async (req: Request, res: Response): Promise<void> => {
    const { planSlug } = req.body as { planSlug: string };
    const userEmail = req.auth.user?.email ?? "";

    const url = await this.subService.createCheckoutUrl(
      req.auth.organization.id,
      planSlug,
      userEmail,
    );

    res.json({ url });
  };

  /** POST /billing/portal — create Lemon Squeezy customer portal URL */
  createPortal = async (req: Request, res: Response): Promise<void> => {
    const url = await this.subService.createPortalUrl(req.auth.organization.id);
    res.json({ url });
  };

  /**
   * POST /webhooks/lemonsqueezy — Lemon Squeezy webhook handler.
   * Must receive the raw body (express.raw middleware applied in routes).
   */
  handleWebhook = async (req: Request, res: Response): Promise<void> => {
    const signature = req.headers["x-signature"] as string | undefined;
    if (!signature) {
      res.status(400).json({ error: "Missing X-Signature header" });
      return;
    }

    try {
      await this.subService.handleWebhook(req.body as Buffer, signature);
      res.status(200).json({ received: true });
    } catch (err) {
      logger.warn({ err }, "Webhook processing failed");
      throw err; // propagate to errorHandler
    }
  };
}
