/**
 * Session-level routing: classify session intent once, lock model for entire session.
 */

import { sessionRoutingDecisions } from "@paperclipai/db";
import { eq, and, isNull } from "drizzle-orm";
import { classifyTask, type ClassificationResult, type Complexity } from "./classifier.js";
import { selectModelPareto, routeTask, getModelProvider } from "./router.js";
import type { Db } from "@paperclipai/db";

export interface SessionRouteRequest {
  sessionId: string;
  companyId: string;
  firstMessage: string;
  attachments?: string[];
}

export interface SessionRouteResult {
  sessionId: string;
  complexity: Complexity;
  role: string;
  confidence: number;
  reason: string;
  agentId: string | null;
  agentName: string | null;
  selectedModel: string | null;
  provider: string | null;
  estimatedLatencyMs: number;
  estimatedCostCents: number;
  isNewDecision: boolean;
}

/**
 * Route a session: if an active routing decision exists, reuse it.
 * Otherwise, classify the first message and lock the model/agent.
 */
export async function routeSession(
  req: SessionRouteRequest,
  dbClient: Db
): Promise<SessionRouteResult> {
  // Check for existing active session routing
  const existing = await dbClient
    .select()
    .from(sessionRoutingDecisions)
    .where(
      and(
        eq(sessionRoutingDecisions.sessionId, req.sessionId),
        eq(sessionRoutingDecisions.companyId, req.companyId),
        isNull(sessionRoutingDecisions.endedAt)
      )
    )
    .then((rows) => rows[0] ?? null);

  if (existing) {
    // Reuse locked routing
    const provider = existing.selectedModel ? getModelProvider(existing.selectedModel).provider : null;
    return {
      sessionId: req.sessionId,
      complexity: existing.complexity as Complexity,
      role: existing.classifiedRole,
      confidence: existing.confidence,
      reason: existing.classificationReason ?? "session-locked",
      agentId: existing.routedAgentId,
      agentName: null, // could fetch if needed
      selectedModel: existing.selectedModel,
      provider,
      estimatedLatencyMs: existing.estimatedLatencyMs ?? 0,
      estimatedCostCents: existing.costEstimateCents ?? 0,
      isNewDecision: false,
    };
  }

  // Classify the first message to determine session intent
  const classification = await classifyTask(req.firstMessage);

  // Select model using Pareto frontier
  const { model, selected } = await selectModelPareto(classification.complexity);

  // Route to best agent using existing router
  const routeResult = await routeTask(dbClient, req.companyId, req.firstMessage, classification);

  // Compute session intent from classification reason
  const sessionIntent = inferSessionIntent(req.firstMessage, classification.reason);

  // Estimate cost for a session (rough: 10x a single task)
  const estimatedCostCents = Math.round(selected.costPer1k * 10 * 10); // 10k tokens * 10 messages

  // Insert session routing decision
  await dbClient.insert(sessionRoutingDecisions).values({
    companyId: req.companyId,
    sessionId: req.sessionId,
    complexity: classification.complexity,
    classifiedRole: classification.agentRole,
    confidence: classification.confidence,
    classificationReason: classification.reason,
    sessionIntent,
    routedAgentId: routeResult.agentId,
    routedAgentRole: classification.agentRole,
    selectedModel: model,
    estimatedLatencyMs: Math.round(selected.latencyMs),
    costEstimateCents: estimatedCostCents,
    paretoFrontierSize: 0, // will be updated if we track frontier per-session
  });

  const newProvider = model ? getModelProvider(model).provider : null;
  return {
    sessionId: req.sessionId,
    complexity: classification.complexity,
    role: classification.agentRole,
    confidence: classification.confidence,
    reason: classification.reason,
    agentId: routeResult.agentId,
    agentName: routeResult.agentName,
    selectedModel: model,
    provider: newProvider,
    estimatedLatencyMs: Math.round(selected.latencyMs),
    estimatedCostCents,
    isNewDecision: true,
  };
}

/**
 * End a session routing decision (mark as completed).
 */
export async function endSessionRouting(sessionId: string, companyId: string, dbClient: Db): Promise<void> {
  await dbClient
    .update(sessionRoutingDecisions)
    .set({ endedAt: new Date() })
    .where(
      and(
        eq(sessionRoutingDecisions.sessionId, sessionId),
        eq(sessionRoutingDecisions.companyId, companyId)
      )
    );
}

/**
 * Update session stats (message count, task count, actual cost).
 */
export async function updateSessionStats(
  sessionId: string,
  companyId: string,
  updates: { messageCount?: number; taskCount?: number; actualCostCents?: number; avgLatencyMs?: number },
  dbClient: Db
): Promise<void> {
  const existing = await dbClient
    .select()
    .from(sessionRoutingDecisions)
    .where(
      and(
        eq(sessionRoutingDecisions.sessionId, sessionId),
        eq(sessionRoutingDecisions.companyId, companyId)
      )
    )
    .then((rows) => rows[0] ?? null);

  if (!existing) return;

  await dbClient
    .update(sessionRoutingDecisions)
    .set({
      messageCount: updates.messageCount ?? existing.messageCount,
      taskCount: updates.taskCount ?? existing.taskCount,
      actualCostCents: updates.actualCostCents ?? existing.actualCostCents,
      avgLatencyMs: updates.avgLatencyMs ?? existing.avgLatencyMs,
      updatedAt: new Date(),
    })
    .where(eq(sessionRoutingDecisions.id, existing.id));
}

/**
 * Infer session intent from the first message and classification reason.
 */
function inferSessionIntent(message: string, reason: string): string {
  const lower = message.toLowerCase();
  const rlower = reason.toLowerCase();

  if (lower.includes("bug") || lower.includes("fix") || lower.includes("error") || rlower.includes("debug")) {
    return "debugging";
  }
  if (lower.includes("feature") || lower.includes("add") || lower.includes("implement") || rlower.includes("feature")) {
    return "feature_request";
  }
  if (lower.includes("plan") || lower.includes("design") || lower.includes("architecture") || rlower.includes("design")) {
    return "planning";
  }
  if (lower.includes("refactor") || lower.includes("clean") || lower.includes("optimize")) {
    return "refactoring";
  }
  if (lower.includes("test") || lower.includes("spec") || rlower.includes("test")) {
    return "testing";
  }
  if (lower.includes("review") || lower.includes("check") || lower.includes("audit")) {
    return "review";
  }
  return "general";
}
