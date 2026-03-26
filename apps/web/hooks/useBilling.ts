"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { PlanRow, SubscriptionRow } from "@/types/session";

interface UseBillingReturn {
  plans: PlanRow[];
  subscription: SubscriptionRow | null;
  loading: boolean;
  error: string | null;
  startCheckout: (planSlug: string) => Promise<void>;
  openPortal: () => Promise<void>;
}

export function useBilling(): UseBillingReturn {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([api.billing.plans(), api.billing.subscription()])
      .then(([p, s]) => {
        setPlans(p);
        setSubscription(s);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load billing info");
      })
      .finally(() => setLoading(false));
  }, []);

  const startCheckout = useCallback(async (planSlug: string) => {
    const { url } = await api.billing.checkout(planSlug);
    window.location.href = url;
  }, []);

  const openPortal = useCallback(async () => {
    const { url } = await api.billing.portal();
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  return { plans, subscription, loading, error, startCheckout, openPortal };
}
