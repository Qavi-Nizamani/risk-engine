/**
 * Seed + migrate script.
 * Usage:
 *   pnpm --filter @risk-engine/db db:seed          # seed plans only
 *   pnpm --filter @risk-engine/db db:migrate-subs  # assign free plan to existing orgs
 */

import dotenv from "dotenv";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { getDb } from "./index";
import { plans, subscriptions, organizations } from "./schema";
import { eq, notExists } from "drizzle-orm";

dotenv.config({ path: resolve(__dirname, "../../../.env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const db = getDb(DATABASE_URL);

// ─── Plan definitions ─────────────────────────────────────────────────────────

const PLANS = [
  {
    name: "Free",
    slug: "free",
    priceMonthyCents: 0,
    maxProjects: 1,
    maxMembers: 1,
    lemonSqueezyVariantId: null,
  },
  {
    name: "Basic",
    slug: "basic",
    priceMonthyCents: 500,
    maxProjects: 1,
    maxMembers: 5,
    lemonSqueezyVariantId: process.env.LEMONSQUEEZY_VARIANT_BASIC ?? null,
  },
  {
    name: "Pro",
    slug: "pro",
    priceMonthyCents: 2000,
    maxProjects: 5,
    maxMembers: null,
    lemonSqueezyVariantId: process.env.LEMONSQUEEZY_VARIANT_PRO ?? null,
  },
] as const;

// ─── Seed plans ───────────────────────────────────────────────────────────────

async function seedPlans(): Promise<void> {
  console.log("Seeding plans...");

  for (const plan of PLANS) {
    await db
      .insert(plans)
      .values(plan)
      .onConflictDoUpdate({
        target: plans.slug,
        set: {
          name: plan.name,
          priceMonthyCents: plan.priceMonthyCents,
          maxProjects: plan.maxProjects ?? null,
          maxMembers: plan.maxMembers ?? null,
          lemonSqueezyVariantId: plan.lemonSqueezyVariantId,
          updatedAt: new Date(),
        },
      });
    console.log(`  ✓ ${plan.name} ($${plan.priceMonthyCents / 100}/mo)`);
  }

  console.log("Plans seeded.");
}

// ─── Migrate existing orgs ────────────────────────────────────────────────────

async function migrateSubscriptions(): Promise<void> {
  console.log("Migrating existing organizations to free plan...");

  const [freePlan] = await db
    .select()
    .from(plans)
    .where(eq(plans.slug, "free"))
    .limit(1);

  if (!freePlan) {
    console.error("Free plan not found — run seed first.");
    process.exit(1);
  }

  // Find all orgs that don't have a subscription yet
  const orgsWithoutSub = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(
      notExists(
        db
          .select({ id: subscriptions.id })
          .from(subscriptions)
          .where(eq(subscriptions.organizationId, organizations.id)),
      ),
    );

  if (orgsWithoutSub.length === 0) {
    console.log("All organizations already have subscriptions.");
    return;
  }

  for (const org of orgsWithoutSub) {
    await db.insert(subscriptions).values({
      organizationId: org.id,
      planId: freePlan.id,
      status: "active",
    });
    console.log(`  ✓ ${org.name} (${org.id}) → Free`);
  }

  // Sync the denormalized plan column
  await db
    .update(organizations)
    .set({ plan: "FREE", updatedAt: new Date() })
    .where(
      notExists(
        db
          .select({ id: subscriptions.id })
          .from(subscriptions)
          .where(
            sql`${subscriptions.organizationId} = ${organizations.id} AND ${subscriptions.planId} = ${freePlan.id}`,
          ),
      ),
    );

  console.log(`Migrated ${orgsWithoutSub.length} organization(s).`);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const command = process.argv[2];

async function main() {
  try {
    if (command === "migrate-subs") {
      await migrateSubscriptions();
    } else {
      // default: seed plans then migrate
      await seedPlans();
      await migrateSubscriptions();
    }
    process.exit(0);
  } catch (err) {
    console.error("Seed failed:", err);
    process.exit(1);
  }
}

void main();
