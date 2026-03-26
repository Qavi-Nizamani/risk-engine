import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createLogger } from "@risk-engine/logger";
import { getDb } from "@risk-engine/db";
import { createRedisClient } from "@risk-engine/redis";
import { asyncHandler, errorHandler } from "@risk-engine/http";
import {
  getApiGatewayPort,
  getDatabaseUrl,
  getRedisStreamName,
  getJwtSecret,
  getAllowedOrigin,
  getIngestionBaseUrl,
  isSignupDisabled,
  getDashboardUrl,
  getLemonSqueezyApiKey,
  getLemonSqueezyStoreId,
  getLemonSqueezyWebhookSecret,
} from "./config/env";
import { createAuthMiddleware } from "./middleware/authenticate";

// Repositories
import { AuthRepository } from "./repositories/auth.repository";
import { OrganizationRepository } from "./repositories/organization.repository";
import { ProjectRepository } from "./repositories/project.repository";
import { IncidentRepository } from "./repositories/incident.repository";
import { EventRepository } from "./repositories/event.repository";
import { ApiKeyRepository } from "./repositories/apiKey.repository";
import { WebhookEndpointRepository } from "./repositories/webhookEndpoint.repository";
import { SubscriptionRepository } from "./repositories/subscription.repository";

// Services
import { AuthService } from "./services/auth.service";
import { OrganizationService } from "./services/organization.service";
import { ProjectService } from "./services/project.service";
import { IncidentService } from "./services/incident.service";
import { EventService } from "./services/event.service";
import { ApiKeyService } from "./services/apiKey.service";
import { WebhookEndpointService } from "./services/webhookEndpoint.service";
import { SubscriptionService } from "./services/subscription.service";

// Controllers
import { AuthController } from "./controllers/auth.controller";
import { OrganizationController } from "./controllers/organization.controller";
import { ProjectController } from "./controllers/project.controller";
import { IncidentController } from "./controllers/incident.controller";
import { EventController } from "./controllers/event.controller";
import { ApiKeyController } from "./controllers/apiKey.controller";
import { WebhookEndpointController } from "./controllers/webhookEndpoint.controller";
import { SubscriptionController } from "./controllers/subscription.controller";

// Routes
import { createAuthRouter } from "./routes/auth.routes";
import { createOrganizationsRouter } from "./routes/organization.routes";
import { createProjectsRouter } from "./routes/project.routes";
import { createIncidentsRouter } from "./routes/incident.routes";
import { createEventsRouter } from "./routes/event.routes";
import { createApiKeysRouter } from "./routes/apiKey.routes";
import { createWebhookEndpointRouter } from "./routes/webhookEndpoint.routes";
import { createSubscriptionRouter } from "./routes/subscription.routes";

const logger = createLogger("api-gateway");

async function bootstrap(): Promise<void> {
  const db = getDb(getDatabaseUrl());
  const redis = createRedisClient();
  const jwtSecret = getJwtSecret();
  const streamName = getRedisStreamName();

  const authenticate = createAuthMiddleware(db, jwtSecret);

  // ── Repositories ─────────────────────────────────────────────────────────────
  const userRepo = new AuthRepository(db);
  const orgRepo = new OrganizationRepository(db);
  const projectRepo = new ProjectRepository(db);
  const incidentRepo = new IncidentRepository(db);
  const eventRepo = new EventRepository(db);
  const apiKeyRepo = new ApiKeyRepository(db);
  const webhookEndpointRepo = new WebhookEndpointRepository(db);
  const subscriptionRepo = new SubscriptionRepository(db);

  // ── Services ──────────────────────────────────────────────────────────────────
  const dashboardUrl = getDashboardUrl();
  const subService = new SubscriptionService(
    subscriptionRepo,
    getLemonSqueezyApiKey(),
    getLemonSqueezyStoreId(),
    getLemonSqueezyWebhookSecret(),
    dashboardUrl,
  );
  const authService = new AuthService(userRepo, orgRepo, jwtSecret, isSignupDisabled(), dashboardUrl, subService);
  const orgService = new OrganizationService(orgRepo, subService);
  const projectService = new ProjectService(projectRepo, apiKeyRepo, subService);
  const incidentService = new IncidentService(incidentRepo, projectRepo, redis, streamName);
  const eventService = new EventService(eventRepo);
  const apiKeyService = new ApiKeyService(apiKeyRepo, projectRepo);
  const webhookEndpointService = new WebhookEndpointService(webhookEndpointRepo, projectRepo, getIngestionBaseUrl());

  // ── Controllers ───────────────────────────────────────────────────────────────
  const authCtrl = new AuthController(authService);
  const orgCtrl = new OrganizationController(orgService);
  const projectCtrl = new ProjectController(projectService);
  const incidentCtrl = new IncidentController(incidentService);
  const eventCtrl = new EventController(eventService);
  const apiKeyCtrl = new ApiKeyController(apiKeyService);
  const webhookEndpointCtrl = new WebhookEndpointController(webhookEndpointService);
  const subscriptionCtrl = new SubscriptionController(subService);

  // ── App ───────────────────────────────────────────────────────────────────────
  const app = express();

  app.use(cors({ origin: getAllowedOrigin(), credentials: true }));

  // Webhook must receive raw body for HMAC signature verification.
  // Must be registered BEFORE express.json() consumes the stream.
  app.post(
    "/webhooks/lemonsqueezy",
    express.raw({ type: "application/json" }),
    asyncHandler(subscriptionCtrl.handleWebhook),
  );

  app.use(express.json());
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "api-gateway", timestamp: new Date().toISOString() });
  });

  // ── Routes ────────────────────────────────────────────────────────────────────
  app.use(createAuthRouter(authCtrl, authenticate));
  app.use(createOrganizationsRouter(orgCtrl, authenticate));
  app.use(createProjectsRouter(projectCtrl, authenticate));
  app.use(createIncidentsRouter(incidentCtrl, authenticate));
  app.use(createEventsRouter(eventCtrl, authenticate));
  app.use(createApiKeysRouter(apiKeyCtrl, authenticate));
  app.use(createWebhookEndpointRouter(webhookEndpointCtrl, authenticate));
  app.use(createSubscriptionRouter(subscriptionCtrl, authenticate));

  app.use(errorHandler);

  const port = getApiGatewayPort();
  app.listen(port, () => {
    logger.info({ port }, "API gateway listening");
  });
}

bootstrap().catch((error) => {
  logger.error({ err: error }, "Failed to start API gateway");
  process.exit(1);
});
