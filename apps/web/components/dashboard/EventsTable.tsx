"use client";

import { useState } from "react";
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
import { EmptyState } from "@/components/shared/EmptyState";
import type { EventRow } from "@/types/session";
import { formatDate, truncateId } from "@/lib/utils";

interface EventsTableProps {
  events: EventRow[];
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

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
      <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
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

export function EventsTable({ events }: EventsTableProps) {
  const [selected, setSelected] = useState<EventRow | null>(null);
  const [open, setOpen] = useState(false);

  function handleRowClick(event: EventRow) {
    setSelected(event);
    setOpen(true);
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-bold uppercase tracking-widest">Events</h2>
        <span className="text-xs text-muted-foreground">({events.length})</span>
      </div>

      <div className="rounded-md border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Type
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Source
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Severity
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Correlation ID
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                  Occurred At
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length === 0 ? (
                <EmptyState
                  colSpan={5}
                  message="No events yet — ingest events via the API using your API key."
                />
              ) : (
                events.map((event) => (
                  <TableRow
                    key={event.id}
                    className="border-border cursor-pointer"
                    onClick={() => handleRowClick(event)}
                  >
                    <TableCell className="text-xs font-medium">
                      {event.type}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {event.source}
                    </TableCell>
                    <TableCell>
                      <SeverityBadge severity={event.severity} />
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground font-mono">
                      {event.correlationId
                        ? truncateId(event.correlationId, 12)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
                      {formatDate(event.occurredAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <EventDetailSheet event={selected} open={open} onOpenChange={setOpen} />
    </section>
  );
}
