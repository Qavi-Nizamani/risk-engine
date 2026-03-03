"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { timeRangeBounds, type TimeRange } from "@/lib/timeRange";
import type { EventRow } from "@/types/session";

const LIVE_INTERVAL_MS = 15_000;

interface UseEventsReturn {
  events: EventRow[];
  loading: boolean;
  fetchEvents: (projectId?: string, range?: TimeRange) => Promise<void>;
  addEvent: (event: EventRow) => void;
}

export function useEvents(): UseEventsReturn {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchEvents = useCallback(async (projectId?: string, range: TimeRange = "today") => {
    setLoading(true);
    try {
      const bounds = timeRangeBounds(range);
      const data = await api.events.list({
        limit: 50,
        project_id: projectId,
        from: bounds?.from,
        to: bounds?.to,
      });
      setEvents(data);
    } finally {
      setLoading(false);
    }

    if (intervalRef.current) clearInterval(intervalRef.current);
    if (range === "live") {
      intervalRef.current = setInterval(() => {
        void api.events
          .list({ limit: 50, project_id: projectId })
          .then(setEvents)
          .catch(() => undefined);
      }, LIVE_INTERVAL_MS);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const addEvent = useCallback((event: EventRow) => {
    setEvents((prev) => {
      if (prev.some((e) => e.id === event.id)) return prev;
      return [event, ...prev].slice(0, 100);
    });
  }, []);

  return { events, loading, fetchEvents, addEvent };
}
