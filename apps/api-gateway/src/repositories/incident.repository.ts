import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb, incidents, incidentEvents, events } from "@risk-engine/db";
import type { Incident, Event } from "@risk-engine/db";

type Db = ReturnType<typeof getDb>;

export interface IncidentQueryFilters {
  organizationId: string;
  projectId?: string;
  from?: Date;
  to?: Date;
}

export class IncidentRepository {
  constructor(private readonly db: Db) {}

  async create(data: {
    organizationId: string;
    projectId: string;
    status: "OPEN" | "INVESTIGATING" | "RESOLVED";
    severity: string;
    summary: string;
  }): Promise<Incident> {
    const [incident] = await this.db.insert(incidents).values(data).returning();
    return incident;
  }

  async findById(id: string, organizationId: string): Promise<Incident | null> {
    const [incident] = await this.db
      .select()
      .from(incidents)
      .where(and(eq(incidents.id, id), eq(incidents.organizationId, organizationId)));
    return incident ?? null;
  }

  async findEventsByIncidentId(incidentId: string): Promise<Event[]> {
    return this.db
      .select({ event: events })
      .from(incidentEvents)
      .innerJoin(events, eq(incidentEvents.eventId, events.id))
      .where(eq(incidentEvents.incidentId, incidentId))
      .orderBy(desc(events.occurredAt))
      .then((rows) => rows.map((r) => r.event));
  }

  async findAllByOrg(filters: IncidentQueryFilters): Promise<Incident[]> {
    const { organizationId, projectId, from, to } = filters;
    const conditions = [eq(incidents.organizationId, organizationId)];
    if (projectId) conditions.push(eq(incidents.projectId, projectId));
    if (from) conditions.push(gte(incidents.createdAt, from));
    if (to) conditions.push(lte(incidents.createdAt, to));
    return this.db
      .select()
      .from(incidents)
      .where(and(...conditions))
      .orderBy(desc(incidents.createdAt));
  }
}
