"use client";

import { useEffect, useCallback, useState } from "react";
import { useEvents } from "@/hooks/useEvents";
import { useIncidents } from "@/hooks/useIncidents";
import { useApiKeys } from "@/hooks/useApiKeys";
import { useWebhookEndpoints } from "@/hooks/useWebhookEndpoints";
import { useSocket } from "@/hooks/useSocket";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { type TimeRange } from "@/lib/timeRange";
import { ProjectHeader } from "@/components/dashboard/ProjectHeader";
import { EventsTable } from "@/components/dashboard/EventsTable";
import { IncidentsTable } from "@/components/dashboard/IncidentsTable";
import { ApiKeysManager } from "@/components/dashboard/ApiKeysManager";
import { WebhookEndpointsManager } from "@/components/dashboard/WebhookEndpointsManager";
import { TimeRangeFilter } from "@/components/dashboard/TimeRangeFilter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import type { EventRow, IncidentRow, ProjectRow } from "@/types/session";

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
  const [timeRange, setTimeRange] = useState<TimeRange>("today");

  useEffect(() => {
    setProjectLoading(true);
    void api.projects.getById(projectId).then((p) => {
      setProject(p);
      setProjectLoading(false);
    }).catch(() => setProjectLoading(false));
  }, [projectId]);

  useEffect(() => {
    void fetchKeys(projectId);
    void fetchEndpoints(projectId);
  }, [projectId, fetchKeys, fetchEndpoints]);

  // Re-fetch events & incidents whenever projectId or timeRange changes
  useEffect(() => {
    void fetchEvents(projectId, timeRange);
    void fetchIncidents(projectId, timeRange);
  }, [projectId, timeRange, fetchEvents, fetchIncidents]);

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
        <div className="flex items-center justify-between gap-4">
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

          <TimeRangeFilter value={timeRange} onChange={setTimeRange} />
        </div>

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
