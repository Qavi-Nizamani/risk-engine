export interface SessionInfo {
  organization: { id: string; name: string; plan: string };
  user: { id: string; email: string; name: string } | null;
}

export interface SignupResult {
  message: string;
}

export interface ProjectRow {
  id: string;
  organizationId: string;
  name: string;
  environment: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectCreateResult extends ProjectRow {
  secretKey: string;
  publishableKey: string;
}

export interface MemberRow {
  id: string;
  organizationId: string;
  userId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  createdAt: string;
  user: { id: string; email: string; name: string };
}

export interface EventRow {
  id: string;
  organizationId: string;
  projectId: string;
  source: string;
  type: string;
  severity: string;
  payload: Record<string, unknown>;
  correlationId?: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface IncidentRow {
  id: string;
  organizationId: string;
  projectId: string;
  severity: string;
  status: string;
  summary: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ApiKeyRow {
  id: string;
  name: string;
  projectId: string;
  type: "secret" | "publishable";
  lastUsedAt: string | null;
  createdAt: string;
}

export interface WebhookEndpointRow {
  id: string;
  name: string;
  projectId: string;
  token: string;
  webhookUrl: string;
  createdAt: string;
}

export interface WebhookEndpointCreateResult extends WebhookEndpointRow {
  secret: string;
}

// ─── Billing ──────────────────────────────────────────────────────────────────

export interface PlanRow {
  id: string;
  name: string;
  slug: string;
  priceMonthyCents: number;
  maxProjects: number | null;
  maxMembers: number | null;
}

export interface SubscriptionRow {
  id: string;
  status: "active" | "cancelled" | "past_due" | "expired" | "on_trial" | "paused";
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  plan: PlanRow;
}
