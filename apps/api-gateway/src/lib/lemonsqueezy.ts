/**
 * Thin Lemon Squeezy API v1 client.
 * Docs: https://docs.lemonsqueezy.com/api
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const LS_BASE = "https://api.lemonsqueezy.com/v1";

export interface LemonSqueezyCheckoutOptions {
  storeId: string;
  variantId: string;
  /** Pre-fill the customer email */
  email?: string;
  /** Arbitrary metadata returned in webhook events */
  custom?: Record<string, string>;
  /** Where to send the customer after a successful payment */
  redirectUrl?: string;
}

export interface LemonSqueezyCheckoutResponse {
  checkoutUrl: string;
}

export interface LemonSqueezyPortalOptions {
  lsSubscriptionId: string;
}

export interface LemonSqueezyPortalResponse {
  url: string;
}

// ─── Webhook payload types ────────────────────────────────────────────────────

export interface LsSubscriptionAttributes {
  store_id: number;
  order_id: number;
  customer_id: number;
  product_id: number;
  variant_id: number;
  product_name: string;
  variant_name: string;
  user_email: string;
  status: "active" | "cancelled" | "past_due" | "expired" | "on_trial" | "paused";
  cancelled: boolean;
  pause: null | { mode: string };
  trial_ends_at: string | null;
  renews_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LsWebhookMeta {
  event_name: string;
  custom_data?: Record<string, string>;
}

export interface LsWebhookPayload {
  meta: LsWebhookMeta;
  data: {
    id: string;
    type: string;
    attributes: LsSubscriptionAttributes;
  };
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class LemonSqueezyClient {
  constructor(
    private readonly apiKey: string,
    private readonly storeId: string,
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${LS_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        ...(init?.headers ?? {}),
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Lemon Squeezy API error ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  /** Create a hosted checkout URL for a given variant. */
  async createCheckout(opts: LemonSqueezyCheckoutOptions): Promise<LemonSqueezyCheckoutResponse> {
    const body = {
      data: {
        type: "checkouts",
        attributes: {
          checkout_options: {
            embed: false,
          },
          checkout_data: {
            email: opts.email,
            custom: opts.custom ?? {},
          },
          product_options: {
            redirect_url: opts.redirectUrl,
          },
        },
        relationships: {
          store: { data: { type: "stores", id: String(opts.storeId) } },
          variant: { data: { type: "variants", id: String(opts.variantId) } },
        },
      },
    };

    const res = await this.request<{ data: { attributes: { url: string } } }>("/checkouts", {
      method: "POST",
      body: JSON.stringify(body),
    });

    return { checkoutUrl: res.data.attributes.url };
  }

  /** Fetch a fresh customer portal URL from the subscription resource. */
  async createPortalSession(opts: LemonSqueezyPortalOptions): Promise<LemonSqueezyPortalResponse> {
    const res = await this.request<{
      data: { attributes: { urls: { customer_portal: string } } };
    }>(`/subscriptions/${opts.lsSubscriptionId}`);
    return { url: res.data.attributes.urls.customer_portal };
  }

  /** Cancel a subscription at period end. */
  async cancelSubscription(lsSubscriptionId: string): Promise<void> {
    await this.request(`/subscriptions/${lsSubscriptionId}`, { method: "DELETE" });
  }

  /** Resume a cancelled subscription (before period ends). */
  async resumeSubscription(lsSubscriptionId: string): Promise<void> {
    await this.request(`/subscriptions/${lsSubscriptionId}`, {
      method: "PATCH",
      body: JSON.stringify({
        data: {
          type: "subscriptions",
          id: lsSubscriptionId,
          attributes: { cancelled: false },
        },
      }),
    });
  }
}

// ─── Webhook signature verification ──────────────────────────────────────────

/**
 * Verifies the X-Signature header sent by Lemon Squeezy.
 * Must be called with the raw request body (Buffer), not parsed JSON.
 */
export function verifyLemonSqueezyWebhook(
  rawBody: Buffer,
  signatureHeader: string,
  webhookSecret: string,
): boolean {
  const hmac = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(hmac), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}
