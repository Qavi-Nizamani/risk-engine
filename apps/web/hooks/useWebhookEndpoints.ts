"use client";

import { useState, useCallback } from "react";
import { api } from "@/lib/api";
import type { WebhookEndpointRow, WebhookEndpointCreateResult } from "@/types/session";

interface UseWebhookEndpointsReturn {
  endpoints: WebhookEndpointRow[];
  loading: boolean;
  fetchEndpoints: (projectId: string) => Promise<void>;
  createEndpoint: (projectId: string, name: string) => Promise<WebhookEndpointCreateResult>;
  revokeEndpoint: (id: string) => Promise<void>;
}

export function useWebhookEndpoints(): UseWebhookEndpointsReturn {
  const [endpoints, setEndpoints] = useState<WebhookEndpointRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchEndpoints = useCallback(async (projectId: string) => {
    setLoading(true);
    try {
      const data = await api.webhookEndpoints.list(projectId);
      setEndpoints(data);
    } finally {
      setLoading(false);
    }
  }, []);

  const createEndpoint = useCallback(
    async (projectId: string, name: string): Promise<WebhookEndpointCreateResult> => {
      const data = await api.webhookEndpoints.create(projectId, name);
      setEndpoints((prev) => [
        {
          id: data.id,
          name: data.name,
          projectId: data.projectId,
          token: data.token,
          webhookUrl: data.webhookUrl,
          createdAt: data.createdAt,
        },
        ...prev,
      ]);
      return data;
    },
    [],
  );

  const revokeEndpoint = useCallback(async (id: string) => {
    await api.webhookEndpoints.revoke(id);
    setEndpoints((prev) => prev.filter((e) => e.id !== id));
  }, []);

  return { endpoints, loading, fetchEndpoints, createEndpoint, revokeEndpoint };
}
