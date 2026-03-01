export enum EventSeverity {
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
  CRITICAL = "CRITICAL",
}

export enum EventType {
  PAYMENT_FAILURE = "payment_failure",
  SERVER_ERROR = "server_error",
  REFUND_SPIKE = "refund_spike",
  WEBHOOK = "webhook",
  MANUAL = "manual",
}

export enum IncidentSeverity {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

export enum IncidentStatus {
  OPEN = "OPEN",
  INVESTIGATING = "INVESTIGATING",
  RESOLVED = "RESOLVED",
}

export interface CorrelationContext {
  user_id?: string;
  customer_id?: string;
  order_id?: string;
  payment_provider?: string;
  plan?: string;
  deployment_id?: string;
}
