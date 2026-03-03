"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { timeRangeBounds, type TimeRange } from "@/lib/timeRange";
import type { IncidentRow } from "@/types/session";

const LIVE_INTERVAL_MS = 15_000;

interface UseIncidentsReturn {
  incidents: IncidentRow[];
  loading: boolean;
  fetchIncidents: (projectId?: string, range?: TimeRange) => Promise<void>;
  addIncident: (incident: IncidentRow) => void;
  updateIncident: (incident: IncidentRow) => void;
}

export function useIncidents(): UseIncidentsReturn {
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchIncidents = useCallback(async (projectId?: string, range: TimeRange = "today") => {
    setLoading(true);
    try {
      const bounds = timeRangeBounds(range);
      const data = await api.incidents.list({
        project_id: projectId,
        from: bounds?.from,
        to: bounds?.to,
      });
      setIncidents(data);
    } finally {
      setLoading(false);
    }

    if (intervalRef.current) clearInterval(intervalRef.current);
    if (range === "live") {
      intervalRef.current = setInterval(() => {
        void api.incidents
          .list({ project_id: projectId })
          .then(setIncidents)
          .catch(() => undefined);
      }, LIVE_INTERVAL_MS);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const addIncident = useCallback((incident: IncidentRow) => {
    setIncidents((prev) => {
      if (prev.some((i) => i.id === incident.id)) return prev;
      return [incident, ...prev];
    });
  }, []);

  const updateIncident = useCallback((incident: IncidentRow) => {
    setIncidents((prev) =>
      prev.map((i) => (i.id === incident.id ? { ...i, ...incident } : i)),
    );
  }, []);

  return { incidents, loading, fetchIncidents, addIncident, updateIncident };
}
