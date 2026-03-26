import { eq } from "drizzle-orm";
import { getDb, plans, subscriptions, organizations } from "@risk-engine/db";
import type { Plan, Subscription } from "@risk-engine/db";

type Db = ReturnType<typeof getDb>;

export interface SubscriptionWithPlan {
  subscription: Subscription;
  plan: Plan;
}

export class SubscriptionRepository {
  constructor(private readonly db: Db) {}

  // ── Plans ──────────────────────────────────────────────────────────────────

  async findAllPlans(): Promise<Plan[]> {
    return this.db
      .select()
      .from(plans)
      .where(eq(plans.isActive, true))
      .orderBy(plans.priceMonthyCents);
  }

  async findPlanBySlug(slug: string): Promise<Plan | null> {
    const [plan] = await this.db
      .select()
      .from(plans)
      .where(eq(plans.slug, slug))
      .limit(1);
    return plan ?? null;
  }

  async findPlanByVariantId(variantId: string): Promise<Plan | null> {
    const [plan] = await this.db
      .select()
      .from(plans)
      .where(eq(plans.lemonSqueezyVariantId, variantId))
      .limit(1);
    return plan ?? null;
  }

  async findPlanById(id: string): Promise<Plan | null> {
    const [plan] = await this.db.select().from(plans).where(eq(plans.id, id)).limit(1);
    return plan ?? null;
  }

  // ── Subscriptions ──────────────────────────────────────────────────────────

  async findByOrg(organizationId: string): Promise<SubscriptionWithPlan | null> {
    const rows = await this.db
      .select({ subscription: subscriptions, plan: plans })
      .from(subscriptions)
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .where(eq(subscriptions.organizationId, organizationId))
      .limit(1);
    return rows[0] ?? null;
  }

  async findByLemonSqueezyId(lsId: string): Promise<Subscription | null> {
    const [sub] = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.lemonSqueezyId, lsId))
      .limit(1);
    return sub ?? null;
  }

  async createFreePlan(organizationId: string, planId: string): Promise<Subscription> {
    const [sub] = await this.db
      .insert(subscriptions)
      .values({ organizationId, planId, status: "active" })
      .returning();
    return sub;
  }

  async upsertFromWebhook(data: {
    organizationId: string;
    planId: string;
    lemonSqueezyId: string;
    lemonSqueezyCustomerId: string;
    lemonSqueezyOrderId: string;
    lemonSqueezyProductId: string;
    lemonSqueezyVariantId: string;
    status: Subscription["status"];
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    trialEndsAt: Date | null;
  }): Promise<Subscription> {
    const [sub] = await this.db
      .insert(subscriptions)
      .values({
        organizationId: data.organizationId,
        planId: data.planId,
        status: data.status,
        lemonSqueezyId: data.lemonSqueezyId,
        lemonSqueezyCustomerId: data.lemonSqueezyCustomerId,
        lemonSqueezyOrderId: data.lemonSqueezyOrderId,
        lemonSqueezyProductId: data.lemonSqueezyProductId,
        lemonSqueezyVariantId: data.lemonSqueezyVariantId,
        currentPeriodStart: data.currentPeriodStart,
        currentPeriodEnd: data.currentPeriodEnd,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd,
        trialEndsAt: data.trialEndsAt,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: subscriptions.organizationId,
        set: {
          planId: data.planId,
          status: data.status,
          lemonSqueezyId: data.lemonSqueezyId,
          lemonSqueezyCustomerId: data.lemonSqueezyCustomerId,
          lemonSqueezyOrderId: data.lemonSqueezyOrderId,
          lemonSqueezyProductId: data.lemonSqueezyProductId,
          lemonSqueezyVariantId: data.lemonSqueezyVariantId,
          currentPeriodStart: data.currentPeriodStart,
          currentPeriodEnd: data.currentPeriodEnd,
          cancelAtPeriodEnd: data.cancelAtPeriodEnd,
          trialEndsAt: data.trialEndsAt,
          updatedAt: new Date(),
        },
      })
      .returning();
    return sub;
  }

  /** Sync the denormalized plan slug on the organizations table. */
  async syncOrgPlan(
    organizationId: string,
    plan: "FREE" | "BASIC" | "PRO" | "ENTERPRISE",
  ): Promise<void> {
    await this.db
      .update(organizations)
      .set({ plan, updatedAt: new Date() })
      .where(eq(organizations.id, organizationId));
  }
}
