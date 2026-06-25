import { pgTable, uuid, text, timestamp, integer, real, boolean, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { issues } from "./issues.js";

/**
 * Tracks AI task routing decisions for cost analysis and optimization.
 * Each row represents one routing decision made by the Model Router.
 */
export const taskRoutingDecisions = pgTable(
  "task_routing_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),

    // The issue/task that was routed
    issueId: uuid("issue_id").references(() => issues.id),

    // Classification result
    complexity: text("complexity").notNull(), // simple | medium | complex
    classifiedRole: text("classified_role").notNull(),
    confidence: real("confidence").notNull().default(0),
    classificationReason: text("classification_reason"),

    // Routing result
    routedAgentId: uuid("routed_agent_id").references(() => agents.id),
    routedAgentRole: text("routed_agent_role").notNull(),
    wasOverridden: boolean("was_overridden").notNull().default(false),
    overrideReason: text("override_reason"),

    // Token usage for classification
    classifierInputTokens: integer("classifier_input_tokens").notNull().default(0),
    classifierOutputTokens: integer("classifier_output_tokens").notNull().default(0),

    // Cost analysis
    estimatedSavingsPercent: integer("estimated_savings_percent").notNull().default(0),
    costEstimateCents: integer("cost_estimate_cents").notNull().default(0),

    // Agent run actuals (for accuracy comparison)
    agentInputTokens: integer("agent_input_tokens").default(0),
    agentOutputTokens: integer("agent_output_tokens").default(0),
    agentModel: text("agent_model"),
    costSource: text("cost_source"), // adapter | adapter_tokens | complexity_estimate

    // Provider failover tracking
    failoverModel: text("failover_model"),
    failoverReason: text("failover_reason"),

    // Latency optimization tracking
    latencyMs: integer("latency_ms"), // actual response time for this routing
    estimatedLatencyMs: integer("estimated_latency_ms"), // predicted latency at routing time

    // Pareto frontier tracking
    paretoFrontierSize: integer("pareto_frontier_size"), // number of models on the frontier
    estimatedCostCents: integer("estimated_cost_cents"), // predicted cost at routing time

    // Prompt cache awareness
    promptHash: text("prompt_hash"), // sha256 of the prompt content
    cacheHit: boolean("cache_hit").default(false), // true if similar prompt was recently seen
    cacheSimilarityScore: real("cache_similarity_score").default(0), // 0-1 similarity to cached prompt

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyCreatedIdx: index("routing_decisions_company_created_idx").on(table.companyId, table.createdAt),
    companyIssueIdx: index("routing_decisions_company_issue_idx").on(table.companyId, table.issueId),
    companyComplexityIdx: index("routing_decisions_company_complexity_idx").on(table.companyId, table.complexity),
    companyAgentIdx: index("routing_decisions_company_agent_idx").on(table.companyId, table.routedAgentId),
    promptHashIdx: index("routing_decisions_prompt_hash_idx").on(table.promptHash),
    companyCacheHitIdx: index("routing_decisions_company_cache_hit_idx").on(table.companyId, table.cacheHit, table.createdAt),
  }),
);
