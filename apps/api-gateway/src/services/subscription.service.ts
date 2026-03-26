import { BadRequestError, ForbiddenError, NotFoundError } from "@risk-engine/http";
import type { Plan, Subscription } from "@risk-engine/db";
import type { SubscriptionRepository, SubscriptionWithPlan } from "../repositories/subscription.repository";
import {
  LemonSqueezyClient,
  verifyLemonSqueezyWebhook,
  type LsWebhookPayload,
} from "../lib/lemonsqueezy";
import { createLogger } from "@risk-engine/logger";

const logger = createLogger("api-gateway:subscription");

const SLUG_TO_ORG_PLAN: Record<string, "FREE" | "BASIC" | "PRO" | "ENTERPRISE"> = {
  free: "FREE",
  basic: "BASIC",
  pro: "PRO",
  enterprise: "ENTERPRISE",
};

export class SubscriptionService {
  private readonly ls: LemonSqueezyClient;

  constructor(
    private readonly subRepo: SubscriptionRepository,
    lsApiKey: string,
    private readonly lsStoreId: string,
    private readonly lsWebhookSecret: string,
    private readonly dashboardUrl: string,
  ) {
    this.ls = new LemonSqueezyClient(lsApiKey);
  }

  // ── Plans ──────────────────────────────────────────────────────────────────

  async listPlans(): Promise<Plan[]> {
    return this.subRepo.findAllPlans();
  }

  // ── Current subscription ───────────────────────────────────────────────────

  async getSubscription(organizationId: string): Promise<SubscriptionWithPlan> {
    const sub = await this.subRepo.findByOrg(organizationId);
    if (!sub) throw new NotFoundError("No subscription found for this organization");
    return sub;
  }

  /** Called on signup — assigns the free plan. */
  async assignFreePlan(organizationId: string): Promise<Subscription> {
    const freePlan = await this.subRepo.findPlanBySlug("free");
    if (!freePlan) throw new Error("Free plan not seeded in database");
    return this.subRepo.createFreePlan(organizationId, freePlan.id);
  }

  // ── Checkout ───────────────────────────────────────────────────────────────

  async createCheckoutUrl(
    organizationId: string,
    planSlug: string,
    userEmail: string,
  ): Promise<string> {
    const plan = await this.subRepo.findPlanBySlug(planSlug);
    if (!plan) throw new NotFoundError(`Plan '${planSlug}' not found`);
    if (plan.slug === "free") throw new BadRequestError("Free plan does not require checkout");
    if (!plan.lemonSqueezyVariantId) {
      throw new BadRequestError("Plan has no Lemon Squeezy variant configured");
    }

    const { checkoutUrl } = await this.ls.createCheckout({
      storeId: this.lsStoreId,
      variantId: plan.lemonSqueezyVariantId,
      email: userEmail,
      custom: { organization_id: organizationId },
      redirectUrl: `${this.dashboardUrl}/dashboard/billing?success=1`,
    });

    return checkoutUrl;
  }

  // ── Customer portal ────────────────────────────────────────────────────────

  async createPortalUrl(organizationId: string): Promise<string> {
    const sub = await this.subRepo.findByOrg(organizationId);
    if (!sub || !sub.subscription.lemonSqueezyId) {
      throw new BadRequestError("No paid subscription found — cannot open billing portal");
    }
    const { url } = await this.ls.createPortalSession({
      lsSubscriptionId: sub.subscription.lemonSqueezyId,
    });
    return url;
  }

  // ── Plan limits ────────────────────────────────────────────────────────────

  /**
   * Throws ForbiddenError if the org has reached its plan project limit.
   * Pass the *current* project count (before the new one is created).
   */
  async enforceProjectLimit(organizationId: string, currentProjectCount: number): Promise<void> {
    const sub = await this.subRepo.findByOrg(organizationId);
    if (!sub) return; // no subscription → no enforcement (shouldn't happen)

    const { maxProjects } = sub.plan;
    if (maxProjects === null) return; // unlimited

    if (currentProjectCount >= maxProjects) {
      throw new ForbiddenError(
        `Your ${sub.plan.name} plan allows up to ${maxProjects} project${maxProjects === 1 ? "" : "s"}. ` +
          `Upgrade to create more.`,
      );
    }
  }

  /**
   * Throws ForbiddenError if the org has reached its plan member limit.
   * Pass the *current* member count (before the new one is added).
   */
  async enforceMemberLimit(organizationId: string, currentMemberCount: number): Promise<void> {
    const sub = await this.subRepo.findByOrg(organizationId);
    if (!sub) return;

    const { maxMembers } = sub.plan;
    if (maxMembers === null) return; // unlimited

    if (currentMemberCount >= maxMembers) {
      throw new ForbiddenError(
        `Your ${sub.plan.name} plan allows up to ${maxMembers} member${maxMembers === 1 ? "" : "s"}. ` +
          `Upgrade to add more.`,
      );
    }
  }

  // ── Webhook ────────────────────────────────────────────────────────────────

  async handleWebhook(rawBody: Buffer, signatureHeader: string): Promise<void> {
    const valid = verifyLemonSqueezyWebhook(rawBody, signatureHeader, this.lsWebhookSecret);
    if (!valid) {
      throw new ForbiddenError("Invalid webhook signature");
    }

    const payload: LsWebhookPayload = JSON.parse(rawBody.toString("utf8"));
    const { event_name, custom_data } = payload.meta;
    const { id: lsId, attributes } = payload.data;

    logger.info({ event: event_name, lsId }, "Lemon Squeezy webhook received");

    const SUBSCRIPTION_EVENTS = [
      "subscription_created",
      "subscription_updated",
      "subscription_cancelled",
      "subscription_expired",
      "subscription_resumed",
      "subscription_paused",
      "subscription_unpaused",
      "subscription_payment_success",
      "subscription_payment_failed",
      "subscription_payment_recovered",
    ];

    if (!SUBSCRIPTION_EVENTS.includes(event_name)) {
      logger.info({ event: event_name }, "Ignoring non-subscription webhook event");
      return;
    }

    const organizationId = custom_data?.organization_id;
    if (!organizationId) {
      logger.warn({ event: event_name, lsId }, "Webhook missing organization_id in custom_data");
      return;
    }

    // Resolve the plan from the variant
    const plan = await this.subRepo.findPlanByVariantId(String(attributes.variant_id));
    if (!plan) {
      logger.warn({ variantId: attributes.variant_id }, "Unknown variant ID in webhook");
      return;
    }

    const currentPeriodStart = attributes.created_at ? new Date(attributes.created_at) : null;
    const currentPeriodEnd = attributes.renews_at
      ? new Date(attributes.renews_at)
      : attributes.ends_at
        ? new Date(attributes.ends_at)
        : null;

    await this.subRepo.upsertFromWebhook({
      organizationId,
      planId: plan.id,
      lemonSqueezyId: lsId,
      lemonSqueezyCustomerId: String(attributes.customer_id),
      lemonSqueezyOrderId: String(attributes.order_id),
      lemonSqueezyProductId: String(attributes.product_id),
      lemonSqueezyVariantId: String(attributes.variant_id),
      status: attributes.status,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: attributes.cancelled && !attributes.ends_at,
      trialEndsAt: attributes.trial_ends_at ? new Date(attributes.trial_ends_at) : null,
    });

    // Sync denormalized plan on organizations
    const orgPlan =
      attributes.status === "active" || attributes.status === "on_trial"
        ? (SLUG_TO_ORG_PLAN[plan.slug] ?? "FREE")
        : "FREE";

    await this.subRepo.syncOrgPlan(organizationId, orgPlan);

    logger.info({ organizationId, plan: plan.slug, status: attributes.status }, "Subscription synced");
  }
}
