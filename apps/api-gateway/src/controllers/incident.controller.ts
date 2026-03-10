import type { Request, Response } from "express";
import type { IncidentService } from "../services/incident.service";

export class IncidentController {
  constructor(private readonly incidentService: IncidentService) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const { projectId, status, severity, summary } = req.body as {
      projectId: string;
      status: "OPEN" | "INVESTIGATING" | "RESOLVED";
      severity: string;
      summary: string;
    };

    const incident = await this.incidentService.create(req.auth.organization.id, {
      projectId,
      status,
      severity,
      summary,
    });

    res.status(201).json({ id: incident.id });
  };

  getEvents = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const evs = await this.incidentService.getEvents(id, req.auth.organization.id);
    res.json(
      evs.map((e) => ({
        id: e.id,
        organizationId: e.organizationId,
        projectId: e.projectId,
        source: e.source,
        type: e.type,
        severity: e.severity,
        payload: e.payload,
        correlationId: e.correlationId,
        occurredAt: e.occurredAt.toISOString(),
        createdAt: e.createdAt.toISOString(),
      })),
    );
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const { project_id, from, to } = req.query as { project_id?: string; from?: string; to?: string };

    const incidents = await this.incidentService.list(req.auth.organization.id, project_id, from, to);

    res.json(
      incidents.map((i) => ({
        id: i.id,
        organizationId: i.organizationId,
        projectId: i.projectId,
        status: i.status,
        severity: i.severity,
        summary: i.summary,
        createdAt: i.createdAt.toISOString(),
        updatedAt: i.updatedAt.toISOString(),
      })),
    );
  };
}
