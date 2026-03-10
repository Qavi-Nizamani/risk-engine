import { Router } from "express";
import { z } from "zod";
import { asyncHandler, validate } from "@risk-engine/http";
import type { RequestHandler } from "express";
import type { IncidentController } from "../controllers/incident.controller";

const createIncidentSchema = z.object({
  projectId: z.string().uuid(),
  status: z.enum(["OPEN", "INVESTIGATING", "RESOLVED"]),
  severity: z.string().min(1),
  summary: z.string().min(1),
});

export function createIncidentsRouter(
  ctrl: IncidentController,
  authenticate: RequestHandler,
): Router {
  const router = Router();

  router.post("/incidents", authenticate, validate(createIncidentSchema), asyncHandler(ctrl.create));
  router.get("/incidents", authenticate, asyncHandler(ctrl.list));
  router.get("/incidents/:id/events", authenticate, asyncHandler(ctrl.getEvents));

  return router;
}
