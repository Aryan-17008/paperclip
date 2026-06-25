import { pgTable, uuid, text, timestamp, integer, real, boolean, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

/**
 * Tracks AI session-level routing decisions.
 * When a user starts a chat session, we classify the session intent once
 * and lock the model/agent for the entire session.
 */
export const sessionRoutingDecisions = pgTable(
  "session_routing_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),

    // Session identifier (links to chat session or external session ID)
    sessionId: text("session_id").notNull(),

    // Classification result for the session intent
    complexity: text("complexity").notNull(), // simple | medium | complex
    classifiedRole: text("classified_role").notNull(),
    confidence: real("confidence").notNull().default(0),
    classificationReason: text("classification_reason"),
    sessionIntent: text("session_intent"), // e.g. "debugging", "feature_request", "planning"

    // Locked routing for the session
    routedAgentId: uuid("routed_agent_id").references(() => agents.id),
    routedAgentRole: text("routed_agent_role").notNull(),
    selectedModel: text("selected_model"), // locked model for session
    wasOverridden: boolean("was_overridden").notNull().default(false),

    // Session stats
    messageCount: integer("message_count").notNull().default(0),
    taskCount: integer("task_count").notNull().default(0),

    // Cost tracking for the whole session
    estimatedSavingsPercent: integer("estimated_savings_percent").notNull().default(0),
    costEstimateCents: integer("cost_estimate_cents").notNull().default(0),
    actualCostCents: integer("actual_cost_cents"), // filled when session ends

    // Latency tracking
    avgLatencyMs: integer("avg_latency_ms"), // average across session
    estimatedLatencyMs: integer("estimated_latency_ms"),

    // Pareto frontier tracking
    paretoFrontierSize: integer("pareto_frontier_size"),

    // Session lifecycle
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }), // null = active
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companySessionIdx: index("session_routing_company_session_idx").on(table.companyId, table.sessionId),
    companyActiveIdx: index("session_routing_company_active_idx").on(table.companyId, table.endedAt),
    companyAgentIdx: index("session_routing_company_agent_idx").on(table.companyId, table.routedAgentId),
    companyStartedIdx: index("session_routing_company_started_idx").on(table.companyId, table.startedAt),
  }),
);
