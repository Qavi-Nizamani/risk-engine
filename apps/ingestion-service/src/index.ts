import express from "express";
import { createLogger } from "@risk-engine/logger";
import { getDb } from "@risk-engine/db";
import { errorHandler } from "@risk-engine/http";
import { getIngestionPort, getDatabaseUrl } from "./config/env";
import { createAuthMiddleware } from "./middleware/authenticate";
import { createWebhookTokenAuthMiddleware } from "./middleware/webhookTokenAuth";

// Repository, Service, Controller
import { WebhookEndpointLookupRepository } from "./repositories/webhookEndpoint.repository";
import { EventIngestionService } from "./services/eventIngestion.service";
import { IngestionController } from "./controllers/ingestion.controller";
import { createIngestionRouter } from "./routes/ingestion.routes";

const logger = createLogger("ingestion-service");

async function bootstrap(): Promise<void> {
  const db = getDb(getDatabaseUrl());
  const authenticate = createAuthMiddleware(db);

  // ── Repository / Service / Controller ────────────────────────────────────────
  const webhookEndpointRepo = new WebhookEndpointLookupRepository(db);
  const webhookTokenAuth = createWebhookTokenAuthMiddleware(webhookEndpointRepo);
  const ingestionService = new EventIngestionService();
  const ingestionCtrl = new IngestionController(ingestionService);

  // ── App ───────────────────────────────────────────────────────────────────────
  const app = express();

  // Skip JSON parsing for the token-based webhook route — it needs the raw body for HMAC.
  app.use((req, res, next) => {
    if (req.path.startsWith("/ingest/webhook/")) return next();
    express.json()(req, res, next);
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "ingestion-service", timestamp: new Date().toISOString() });
  });

  app.use(createIngestionRouter(ingestionCtrl, authenticate, webhookTokenAuth));

  app.use(errorHandler);

  const port = getIngestionPort();
  app.listen(port, () => {
    logger.info({ port }, "Ingestion service listening");
  });
}

bootstrap().catch((error) => {
  logger.error({ error }, "Failed to start ingestion service");
  process.exit(1);
});
