"use client";

import { useEffect, useCallback } from "react";
import { useEvents } from "@/hooks/useEvents";
import { useIncidents } from "@/hooks/useIncidents";
import { useApiKeys } from "@/hooks/useApiKeys";
import { useWebhookEndpoints } from "@/hooks/useWebhookEndpoints";
import { useSocket } from "@/hooks/useSocket";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { ProjectHeader } from "@/components/dashboard/ProjectHeader";
import { EventsTable } from "@/components/dashboard/EventsTable";
import { IncidentsTable } from "@/components/dashboard/IncidentsTable";
import { ApiKeysManager } from "@/components/dashboard/ApiKeysManager";
import { WebhookEndpointsManager } from "@/components/dashboard/WebhookEndpointsManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import type { EventRow, IncidentRow } from "@/types/session";
import { useState } from "react";
import type { ProjectRow } from "@/types/session";

interface ProjectDetailPageProps {
  projectId: string;
}

export function ProjectDetailPage({ projectId }: ProjectDetailPageProps) {
  const { session } = useAuth();
  const { events, fetchEvents, addEvent } = useEvents();
  const { incidents, fetchIncidents, addIncident, updateIncident } = useIncidents();
  const { keys, fetchKeys, generateKey, revokeKey } = useApiKeys();
  const { endpoints, fetchEndpoints, createEndpoint, revokeEndpoint } = useWebhookEndpoints();
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [projectLoading, setProjectLoading] = useState(true);

  useEffect(() => {
    setProjectLoading(true);
    void api.projects.getById(projectId).then((p) => {
      setProject(p);
      setProjectLoading(false);
    }).catch(() => setProjectLoading(false));
  }, [projectId]);

  useEffect(() => {
    void fetchEvents(projectId);
    void fetchIncidents(projectId);
    void fetchKeys(projectId);
    void fetchEndpoints(projectId);
  }, [projectId, fetchEvents, fetchIncidents, fetchKeys, fetchEndpoints]);

  const onEventCreated = useCallback(
    (payload: unknown) => {
      const ev = payload as EventRow;
      if (ev.projectId === projectId) addEvent(ev);
    },
    [addEvent, projectId],
  );
  const onIncidentCreated = useCallback(
    (payload: unknown) => {
      const inc = payload as IncidentRow;
      if (inc.projectId === projectId) addIncident(inc);
    },
    [addIncident, projectId],
  );
  const onIncidentUpdated = useCallback(
    (payload: unknown) => {
      const inc = payload as IncidentRow;
      if (inc.projectId === projectId) updateIncident(inc);
    },
    [updateIncident, projectId],
  );

  useSocket({
    organizationId: session?.organization.id ?? null,
    onEventCreated,
    onIncidentCreated,
    onIncidentUpdated,
  });

  if (projectLoading) {
    return (
      <div className="p-6">
        <LoadingSpinner rows={3} />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Project not found.</div>
    );
  }

  return (
    <div className="space-y-6">
      <ProjectHeader project={project} />

      <Tabs defaultValue="events">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="events" className="text-xs">
            Events ({events.length})
          </TabsTrigger>
          <TabsTrigger value="incidents" className="text-xs">
            Incidents ({incidents.length})
          </TabsTrigger>
          <TabsTrigger value="apikeys" className="text-xs">
            API Keys ({keys.length})
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="text-xs">
            Webhooks ({endpoints.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="mt-4">
          <EventsTable events={events} />
        </TabsContent>

        <TabsContent value="incidents" className="mt-4">
          <IncidentsTable incidents={incidents} />
        </TabsContent>

        <TabsContent value="apikeys" className="mt-4">
          <ApiKeysManager
            keys={keys}
            projectId={projectId}
            onGenerate={generateKey}
            onRevoke={revokeKey}
          />
        </TabsContent>

        <TabsContent value="webhooks" className="mt-4">
          <WebhookEndpointsManager
            endpoints={endpoints}
            projectId={projectId}
            onCreate={createEndpoint}
            onRevoke={revokeEndpoint}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
