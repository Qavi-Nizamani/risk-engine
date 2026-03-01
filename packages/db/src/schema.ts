import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

// ─── Organizations (Tenant Root) ─────────────────────────────────────────────

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 256 }).notNull(),
  plan: varchar("plan", { length: 64 })
    .$type<"FREE" | "PRO" | "ENTERPRISE">()
    .notNull()
    .default("FREE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 256 }).notNull().unique(),
  name: varchar("name", { length: 256 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Organization Members ─────────────────────────────────────────────────────

export const organizationMembers = pgTable("organization_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 32 })
    .$type<"OWNER" | "ADMIN" | "MEMBER">()
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Projects ─────────────────────────────────────────────────────────────────

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 512 }).notNull(),
  environment: varchar("environment", { length: 64 })
    .$type<"PRODUCTION" | "STAGING" | "DEV">()
    .notNull()
    .default("PRODUCTION"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── API Keys ─────────────────────────────────────────────────────────────────

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    keyHash: varchar("key_hash", { length: 255 }).notNull().unique(),
    name: varchar("name", { length: 128 }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("api_keys_key_hash_idx").on(table.keyHash),
  ],
);

// ─── Events ───────────────────────────────────────────────────────────────────

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    source: varchar("source", { length: 256 }).notNull(),
    type: varchar("type", { length: 256 }).notNull(),
    severity: varchar("severity", { length: 32 })
      .notNull()
      .$type<"INFO" | "WARN" | "ERROR" | "CRITICAL">(),
    correlationId: varchar("correlation_id", { length: 256 }),
    correlation: jsonb("correlation")
      .$type<{
        user_id?: string;
        customer_id?: string;
        order_id?: string;
        payment_provider?: string;
        plan?: string;
        deployment_id?: string;
      }>()
      .notNull()
      .default({}),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_events_org_time").on(table.organizationId, table.occurredAt),
    index("idx_events_project_time").on(table.projectId, table.occurredAt),
    index("idx_events_correlation").on(table.correlationId),
    index("idx_events_type_time").on(table.organizationId, table.type, table.occurredAt),
    index("idx_events_correlation_gin").on(table.correlation),
  ],
);

// ─── Incidents ────────────────────────────────────────────────────────────────

export const incidents = pgTable("incidents", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 32 })
    .notNull()
    .$type<"OPEN" | "INVESTIGATING" | "RESOLVED">()
    .default("OPEN"),
  severity: varchar("severity", { length: 32 }).notNull(),
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Incident ↔ Events (join table) ──────────────────────────────────────────

export const incidentEvents = pgTable(
  "incident_events",
  {
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.incidentId, table.eventId] }),
  ],
);

// ─── Inferred types ───────────────────────────────────────────────────────────

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type NewOrganizationMember = typeof organizationMembers.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Incident = typeof incidents.$inferSelect;
export type NewIncident = typeof incidents.$inferInsert;
export type IncidentEvent = typeof incidentEvents.$inferSelect;
export type NewIncidentEvent = typeof incidentEvents.$inferInsert;
