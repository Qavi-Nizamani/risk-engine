import type {
  SessionInfo,
  SignupResult,
  EventRow,
  IncidentRow,
  ApiKeyRow,
  ProjectRow,
  ProjectCreateResult,
  MemberRow,
  WebhookEndpointRow,
  WebhookEndpointCreateResult,
} from "@/types/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

console.log("API_URL", API_URL);
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });

  if (!res.ok) {
    const body = (await res
      .json()
      .catch(() => ({ message: res.statusText }))) as { message?: string };
    throw new ApiError(res.status, body.message ?? res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  auth: {
    me: () => request<SessionInfo>("/auth/me"),
    login: (email: string, password: string) =>
      request<{
        user: SessionInfo["user"];
        organization: SessionInfo["organization"];
      }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    signup: (data: {
      email: string;
      name: string;
      orgName: string;
      password: string;
    }) =>
      request<SignupResult>("/auth/signup", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    logout: () => request<void>("/auth/logout", { method: "POST" }),
  },

  projects: {
    list: () => request<ProjectRow[]>("/projects"),
    create: (name: string, environment?: string) =>
      request<ProjectCreateResult>("/projects", {
        method: "POST",
        body: JSON.stringify({ name, environment }),
      }),
    getById: (id: string) => request<ProjectRow>(`/projects/${id}`),
    update: (id: string, data: { name?: string; environment?: string }) =>
      request<ProjectRow>(`/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<void>(`/projects/${id}`, { method: "DELETE" }),
  },

  organizations: {
    members: () => request<MemberRow[]>("/organizations/members"),
    updateMe: (data: { name?: string; plan?: string }) =>
      request<{
        id: string;
        name: string;
        plan: string;
        createdAt: string;
        updatedAt: string;
      }>("/organizations/me", { method: "PATCH", body: JSON.stringify(data) }),
  },

  events: {
    list: (params?: {
      limit?: number;
      type?: string;
      severity?: string;
      project_id?: string;
    }) => {
      const query = new URLSearchParams();
      if (params?.limit) query.set("limit", String(params.limit));
      if (params?.type) query.set("type", params.type);
      if (params?.severity) query.set("severity", params.severity);
      if (params?.project_id) query.set("project_id", params.project_id);
      const qs = query.toString();
      return request<EventRow[]>(`/events${qs ? `?${qs}` : ""}`);
    },
  },

  incidents: {
    list: (params?: { project_id?: string }) => {
      const query = new URLSearchParams();
      if (params?.project_id) query.set("project_id", params.project_id);
      const qs = query.toString();
      return request<IncidentRow[]>(`/incidents${qs ? `?${qs}` : ""}`);
    },
  },

  apiKeys: {
    list: (projectId: string) =>
      request<ApiKeyRow[]>(`/projects/${projectId}/api-keys`),
    create: (projectId: string, name: string) =>
      request<{
        id: string;
        name: string;
        projectId: string;
        key: string;
        createdAt: string;
      }>(`/projects/${projectId}/api-keys`, {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    revoke: (id: string) =>
      request<void>(`/api-keys/${id}`, { method: "DELETE" }),
  },

  webhookEndpoints: {
    list: (projectId: string) =>
      request<WebhookEndpointRow[]>(`/projects/${projectId}/webhook-endpoints`),
    create: (projectId: string, name: string) =>
      request<WebhookEndpointCreateResult>(
        `/projects/${projectId}/webhook-endpoints`,
        {
          method: "POST",
          body: JSON.stringify({ name }),
        },
      ),
    revoke: (id: string) =>
      request<void>(`/webhook-endpoints/${id}`, { method: "DELETE" }),
  },
} as const;
