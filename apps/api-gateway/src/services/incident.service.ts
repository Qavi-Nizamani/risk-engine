import type { createRedisClient } from "@risk-engine/redis";

type Redis = ReturnType<typeof createRedisClient>;
import type { Incident, Event } from "@risk-engine/db";
import { ForbiddenError, NotFoundError } from "@risk-engine/http";
import { INCIDENT_CREATED } from "@risk-engine/events";
import type { IncidentRepository } from "../repositories/incident.repository";
import type { ProjectRepository } from "../repositories/project.repository";

export class IncidentService {
  constructor(
    private readonly incidentRepo: IncidentRepository,
    private readonly projectRepo: ProjectRepository,
    private readonly redis: Redis,
    private readonly streamName: string,
  ) {}

  async create(
    organizationId: string,
    input: {
      projectId: string;
      status: "OPEN" | "INVESTIGATING" | "RESOLVED";
      severity: string;
      summary: string;
    },
  ): Promise<Incident> {
    const ownedProject = await this.projectRepo.findByIdAndOrg(input.projectId, organizationId);
    if (!ownedProject) throw new ForbiddenError("Project not found in your organization");

    const incident = await this.incidentRepo.create({ organizationId, ...input });

    await this.redis.xadd(
      this.streamName,
      "*",
      "type",
      INCIDENT_CREATED,
      "organizationId",
      incident.organizationId,
      "data",
      JSON.stringify({
        incidentId: incident.id,
        organizationId: incident.organizationId,
        projectId: incident.projectId,
        status: incident.status,
        severity: incident.severity,
        summary: incident.summary,
        createdAt: incident.createdAt.toISOString(),
        updatedAt: incident.updatedAt.toISOString(),
      }),
    );

    return incident;
  }

  async getEvents(incidentId: string, organizationId: string): Promise<Event[]> {
    const incident = await this.incidentRepo.findById(incidentId, organizationId);
    if (!incident) throw new NotFoundError("Incident not found");
    return this.incidentRepo.findEventsByIncidentId(incidentId);
  }

  async list(
    organizationId: string,
    projectId?: string,
    from?: string,
    to?: string,
  ): Promise<Incident[]> {
    return this.incidentRepo.findAllByOrg({
      organizationId,
      projectId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }
}
