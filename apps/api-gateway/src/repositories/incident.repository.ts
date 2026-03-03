import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb, incidents } from "@risk-engine/db";
import type { Incident } from "@risk-engine/db";

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
