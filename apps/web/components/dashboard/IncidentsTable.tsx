"use client";

import { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SeverityBadge } from "@/components/dashboard/SeverityBadge";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import type { IncidentRow, EventRow } from "@/types/session";
import { formatDate, truncateId } from "@/lib/utils";
import { api } from "@/lib/api";

// ── Shared field layout ───────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

// ── Event detail sheet (nested) ───────────────────────────────────────────────

function EventDetailSheet({
  event,
  open,
  onOpenChange,
}: {
  event: EventRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  if (!event) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 py-4 border-b border-border">
          <SheetTitle className="text-sm font-bold uppercase tracking-widest">
            Event Detail
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-6 py-5 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Type">
                <span className="font-medium">{event.type}</span>
              </Field>
              <Field label="Source">
                <span className="text-muted-foreground">{event.source}</span>
              </Field>
            </div>

            <Field label="Severity">
              <SeverityBadge severity={event.severity} />
            </Field>

            <Field label="Event ID">
              <span className="font-mono text-xs text-muted-foreground break-all">
                {event.id}
              </span>
            </Field>

            <Field label="Correlation ID">
              <span className="font-mono text-xs text-muted-foreground break-all">
                {event.correlationId ?? "—"}
              </span>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Occurred At">
                <span className="text-xs text-muted-foreground">
                  {formatDate(event.occurredAt)}
                </span>
              </Field>
              <Field label="Ingested At">
                <span className="text-xs text-muted-foreground">
                  {formatDate(event.createdAt)}
                </span>
              </Field>
            </div>

            <Field label="Payload">
              <pre className="rounded-md bg-muted px-4 py-3 text-[11px] font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(event.payload, null, 2)}
              </pre>
            </Field>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ── Incident detail sheet ─────────────────────────────────────────────────────

function IncidentDetailSheet({
  incident,
  open,
  onOpenChange,
}: {
  incident: IncidentRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [incidentEvents, setIncidentEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null);
  const [eventSheetOpen, setEventSheetOpen] = useState(false);

  // Fetch events whenever the sheet opens (open prop is set from outside,
  // so handleOpenChange on the Sheet never fires for the initial open).
  useEffect(() => {
    if (open && incident) {
      setLoading(true);
      void api.incidents
        .getEvents(incident.id)
        .then(setIncidentEvents)
        .catch(() => setIncidentEvents([]))
        .finally(() => setLoading(false));
    } else {
      setIncidentEvents([]);
    }
  }, [open, incident]);

  function handleEventClick(event: EventRow) {
    setSelectedEvent(event);
    setEventSheetOpen(true);
  }

  if (!incident) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-xl flex flex-col gap-0 p-0">
          <SheetHeader className="px-6 py-4 border-b border-border">
            <SheetTitle className="text-sm font-bold uppercase tracking-widest">
              Incident Detail
            </SheetTitle>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="px-6 py-5 space-y-5">
              <Field label="Incident ID">
                <span className="font-mono text-xs text-muted-foreground break-all">
                  {incident.id}
                </span>
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Severity">
                  <SeverityBadge severity={incident.severity} />
                </Field>
                <Field label="Status">
                  <StatusBadge status={incident.status} />
                </Field>
              </div>

              <Field label="Summary">
                <span className="text-sm text-muted-foreground">{incident.summary}</span>
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Created At">
                  <span className="text-xs text-muted-foreground">
                    {formatDate(incident.createdAt)}
                  </span>
                </Field>
                {incident.updatedAt && (
                  <Field label="Last Updated">
                    <span className="text-xs text-muted-foreground">
                      {formatDate(incident.updatedAt)}
                    </span>
                  </Field>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Linked Events{!loading && ` (${incidentEvents.length})`}
                </p>

                {loading ? (
                  <div className="text-xs text-muted-foreground py-4 text-center">
                    Loading events…
                  </div>
                ) : incidentEvents.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-4 text-center">
                    No events linked to this incident.
                  </div>
                ) : (
                  <div className="rounded-md border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border hover:bg-transparent">
                          <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground">
                            Type
                          </TableHead>
                          <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground">
                            Severity
                          </TableHead>
                          <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                            Occurred At
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {incidentEvents.map((ev) => (
                          <TableRow
                            key={ev.id}
                            className="border-border cursor-pointer"
                            onClick={() => handleEventClick(ev)}
                          >
                            <TableCell className="text-xs font-medium">
                              {ev.type}
                            </TableCell>
                            <TableCell>
                              <SeverityBadge severity={ev.severity} />
                            </TableCell>
                            <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
                              {formatDate(ev.occurredAt)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <EventDetailSheet
        event={selectedEvent}
        open={eventSheetOpen}
        onOpenChange={setEventSheetOpen}
      />
    </>
  );
}

// ── Incidents table ───────────────────────────────────────────────────────────

interface IncidentsTableProps {
  incidents: IncidentRow[];
}

export function IncidentsTable({ incidents }: IncidentsTableProps) {
  const [selected, setSelected] = useState<IncidentRow | null>(null);
  const [open, setOpen] = useState(false);

  function handleRowClick(incident: IncidentRow) {
    setSelected(incident);
    setOpen(true);
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-bold uppercase tracking-widest">Incidents</h2>
        <span className="text-xs text-muted-foreground">({incidents.length})</span>
      </div>

      <div className="rounded-md border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  ID
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Severity
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Summary
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                  Created
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {incidents.length === 0 ? (
                <EmptyState colSpan={5} message="No incidents yet." />
              ) : (
                incidents.map((incident) => (
                  <TableRow
                    key={incident.id}
                    className="border-border cursor-pointer"
                    onClick={() => handleRowClick(incident)}
                  >
                    <TableCell className="text-[11px] text-muted-foreground font-mono">
                      {truncateId(incident.id || "")}
                    </TableCell>
                    <TableCell>
                      <SeverityBadge severity={incident.severity} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={incident.status} />
                    </TableCell>
                    <TableCell className="text-xs max-w-sm">
                      {incident.summary}
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
                      {formatDate(incident.createdAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <IncidentDetailSheet incident={selected} open={open} onOpenChange={setOpen} />
    </section>
  );
}
