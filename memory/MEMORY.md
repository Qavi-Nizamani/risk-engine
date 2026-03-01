# Project Memory

# 🧠 Product Identity & Strategic Direction

## Product Category

This system is a:

> **AI-Powered Realtime Risk Analysis & Incident Intelligence Engine**

It is NOT:
- Just an error tracker
- Not a logging system
- Not a monitoring dashboard clone
- Not installment-specific anymore

It is positioned as:

> **Founder Risk Intelligence Engine for SaaS & E-commerce Platforms**

---

## Core Purpose

The engine exists to:

1. Ingest operational signals (payments, errors, latency, refunds, churn signals)
2. Correlate related events intelligently
3. Detect abnormal behavioral patterns
4. Quantify risk using scoring models
5. Automatically generate structured incidents
6. Stream actionable intelligence to founders in real time

This is a decision-support system, not a raw observability tool.

---

## Target Audience

Primary:
- Small SaaS founders
- E-commerce operators
- Non-DevOps startups
- Stripe-heavy platforms
- Installment / subscription businesses

They:
- Do not understand logs
- Do not monitor infrastructure deeply
- Do not correlate signals manually
- Need simplified intelligence

---

## Differentiation from Existing Tools

Compared to tools like Sentry / Datadog:

| Traditional Monitoring | This System |
|------------------------|-------------|
| Shows logs | Explains risk |
| Error tracking | Business-impact tracking |
| DevOps oriented | Founder oriented |
| Technical metrics | Revenue + risk signals |
| Alerts | Intelligence |

This engine focuses on:
- Revenue risk
- Payment instability
- Refund spikes
- Conversion drops
- Platform health correlation

Not just stack traces.

---

## Intelligence Model Direction

The system evolves toward:

1. Rule-based detection (current stage)
2. Statistical anomaly detection (baseline comparison)
3. Behavioral correlation engine
4. Risk scoring model per project
5. AI summarization layer (incident explanation)
6. Predictive risk modeling

Long-term vision:
- “Your platform is trending toward payment instability.”
- “Refund spike likely caused by last deployment.”
- “You may lose 12% revenue in next 6 hours if pattern continues.”

---

## End-State Vision

The product becomes:

> A real-time operational risk brain for internet businesses.

System characteristics:

- Event-driven
- Correlation-aware
- Horizontally scalable
- Queue-based processing
- Stream-based communication
- Multi-tenant
- Risk score per project
- Historical intelligence retained
- AI explanation-ready

---

## Strategic Positioning Summary

Name concept:
- Risk Intelligence Engine
- Founder Risk Brain
- Revenue Risk Monitor
- Operational Risk Engine

Core message:

"You don't need DevOps to understand your platform risk."

## Architecture
- Monorepo with pnpm workspaces + turbo
- Apps: api-gateway (4000), ingestion-service (4100), worker-risk (4002), websocket-service (4001), web (Next.js)
- Packages: @risk-engine/db, @risk-engine/types, @risk-engine/events, @risk-engine/logger, @risk-engine/redis, @risk-engine/utils

## Database
- **PostgreSQL** via Drizzle ORM (migrated from MongoDB/Mongoose)
- Shared package: `packages/db` (`@risk-engine/db`)
- Schema: projects, events, incidents tables in `packages/db/src/schema.ts`
- Client: `getDb(connectionString)` exported from `packages/db/src/index.ts` (lazy singleton)
- Connection string: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/incident_intel`
- Migrations: `pnpm --filter @risk-engine/db db:generate` / `db:migrate`
- Docker: `docker-compose.yml` runs postgres:16 with POSTGRES_USER/PASSWORD/DB env vars

## Key Patterns
- All three backend services (api-gateway, ingestion-service, worker-risk) use `getDb(getDatabaseUrl())` from `@risk-engine/db`
- `getDatabaseUrl()` reads `DATABASE_URL` env var (throws if missing) — in each service's `src/config/env.ts`
- worker-risk uses drizzle-orm operators: `and`, `eq`, `gte`, `lte`, `desc` for event queries

## Redis
- Redis streams for event/incident events (REDIS_STREAM_NAME=platform-events)
- BullMQ queue: ANOMALY_QUEUE_NAME=anomaly-detection

## What was cleaned up
- Removed all Mongoose models and db/mongoose.ts from all three apps
- Removed legacy Customer/Installment models and routes (unused orphan code)
- `bullmq` removed from api-gateway (not used there)
