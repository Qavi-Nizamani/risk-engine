"use client";

import { useState } from "react";
import { useBilling } from "@/hooks/useBilling";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Check, Loader2, ExternalLink, AlertCircle } from "lucide-react";
import type { PlanRow } from "@/types/session";

const PLAN_FEATURES: Record<string, string[]> = {
  free: [
    "1 project",
    "1 team member",
    "Real-time event ingestion",
    "Incident detection",
  ],
  basic: [
    "1 project",
    "Up to 5 team members",
    "Everything in Free",
    "Priority support",
  ],
  pro: [
    "Up to 5 projects",
    "Unlimited team members",
    "Everything in Basic",
    "Advanced analytics",
    "Custom webhooks",
  ],
};

function formatPrice(cents: number): string {
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(0)}/mo`;
}

function PlanCard({
  plan,
  isCurrent,
  onUpgrade,
  upgrading,
}: {
  plan: PlanRow;
  isCurrent: boolean;
  onUpgrade: (slug: string) => Promise<void>;
  upgrading: boolean;
}) {
  const features = PLAN_FEATURES[plan.slug] ?? [];
  const isFree = plan.slug === "free";

  return (
    <Card
      className={`relative flex flex-col ${isCurrent ? "border-primary ring-1 ring-primary" : ""}`}
    >
      {isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-primary text-primary-foreground text-xs px-3">
            Current plan
          </Badge>
        </div>
      )}

      <CardHeader className="pb-4">
        <CardTitle className="text-lg">{plan.name}</CardTitle>
        <div className="text-3xl font-bold mt-1">
          {formatPrice(plan.priceMonthyCents)}
        </div>
        <CardDescription className="text-xs mt-1">
          {plan.maxProjects === null ? "Unlimited" : plan.maxProjects} project
          {plan.maxProjects === 1 ? "" : "s"} &middot;{" "}
          {plan.maxMembers === null ? "Unlimited" : plan.maxMembers} member
          {plan.maxMembers === 1 ? "" : "s"}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col flex-1">
        <ul className="space-y-2 flex-1 mb-6">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm">
              <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              {f}
            </li>
          ))}
        </ul>

        {isCurrent ? (
          <Button variant="outline" disabled className="w-full">
            Current plan
          </Button>
        ) : isFree ? (
          <Button variant="outline" disabled className="w-full">
            Downgrade
          </Button>
        ) : (
          <Button
            variant="default"
            className="w-full"
            onClick={() => void onUpgrade(plan.slug)}
            disabled={upgrading}
          >
            {upgrading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Upgrade
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function BillingPage() {
  const { plans, subscription, loading, error, startCheckout, openPortal } =
    useBilling();
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const handleUpgrade = async (slug: string) => {
    setUpgrading(slug);
    try {
      await startCheckout(slug);
    } finally {
      setUpgrading(null);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      await openPortal();
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-destructive p-4">
        <AlertCircle className="h-4 w-4" />
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  const currentSlug = subscription?.plan.slug ?? "free";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Billing</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your subscription and billing details.
          </p>
        </div>

        {currentSlug !== "free" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handlePortal()}
            disabled={portalLoading}
          >
            {portalLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
            ) : (
              <ExternalLink className="h-3.5 w-3.5 mr-2" />
            )}
            Manage billing
          </Button>
        )}
      </div>

      {/* Migration / free-plan notice */}
      {currentSlug === "free" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 flex gap-3">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            <span className="font-medium">Free plan limitation:</span> You can
            have 1 project and 1 team member. If you were migrated from a paid
            plan and have more than 1 project, upgrade to keep access to all of
            them.
          </p>
        </div>
      )}

      {/* Active subscription details */}
      {subscription && currentSlug !== "free" && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-sm">
              <p className="font-medium">{subscription.plan.name} plan</p>
              <Badge variant="outline" className="capitalize text-xs">
                {subscription.status}
              </Badge>
              {subscription.currentPeriodEnd && (
                <p className="text-muted-foreground ml-auto">
                  {subscription.cancelAtPeriodEnd ? "Cancels" : "Renews"} on{" "}
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plan grid */}
      <div className="grid grid-cols-1 max-w-6xl mx-auto md:grid-cols-2 xl:grid-cols-3 gap-6 pt-2">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isCurrent={plan.slug === currentSlug}
            onUpgrade={handleUpgrade}
            upgrading={upgrading === plan.slug}
          />
        ))}
      </div>
    </div>
  );
}
