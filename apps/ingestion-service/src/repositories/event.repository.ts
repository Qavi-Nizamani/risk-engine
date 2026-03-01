import { getDb, events } from "@risk-engine/db";
import type { Event } from "@risk-engine/db";
import type { CorrelationContext } from "@risk-engine/types";

type Db = ReturnType<typeof getDb>;

export class EventIngestionRepository {
  constructor(private readonly db: Db) {}

  async insert(data: {
    organizationId: string;
    projectId: string;
    source: string;
    type: string;
    severity: "INFO" | "WARN" | "ERROR" | "CRITICAL";
    payload: Record<string, unknown>;
    correlationId: string;
    correlation: CorrelationContext;
    occurredAt: Date;
  }): Promise<Event> {
    const [event] = await this.db.insert(events).values(data).returning();
    return event;
  }
}
