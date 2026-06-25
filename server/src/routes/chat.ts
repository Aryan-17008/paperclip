import { Router } from "express";
import { z } from "zod";
import { eq, and, gt, desc } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents as agentsTable, issues as issuesTable, taskRoutingDecisions } from "@paperclipai/db";
import { AGENT_ROLE_LABELS } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { issueService } from "../services/index.js";
import { logActivity } from "../services/activity-log.js";
import { randomUUID } from "node:crypto";
import { classifyTask } from "../ai/classifier.js";
import { routeTask, calculateRoutingSavings, estimateCostFromTokens, hashPrompt, getModelProvider, lookupPromptCache, storePromptCache } from "../ai/router.js";
import { routeSession, endSessionRouting } from "../ai/session-router.js";

const chatRouteSchema = z.object({
  prompt: z.string().min(1).max(5000),
  companyId: z.string().uuid(),
  provider: z.string().optional(),
  model: z.string().optional(),
});

const ROLE_KEYWORDS: Record<string, string[]> = {
  cmo: ["content", "blog", "social", "marketing", "brand", "copy", "write", "article", "post", "media"],
  security: ["security", "audit", "vulnerability", "scan", "penetration", "compliance", "gdpr", "hipaa", "auth"],
  engineer: ["backend", "api", "code", "server", "database", "db", "endpoint", "microservice", "architecture"],
  frontend_engineer: ["frontend", "ui", "react", "css", "html", "component", "page", "design", "layout", "client"],
  backend_engineer: ["backend", "api", "server", "database", "db", "endpoint", "microservice", "sql", "nosql"],
  qa: ["testing", "bug", "test", "qa", "quality", "regression", "e2e", "unit test", "integration"],
  qa_tester: ["testing", "bug", "test", "qa", "quality", "regression", "e2e", "unit test", "integration"],
  ceo: ["roadmap", "strategy", "plan", "vision", "goal", "objective", "milestone", "direction", "leadership"],
  cto: ["tech", "technology", "infrastructure", "system", "platform", "engineering", "stack"],
  designer: ["design", "ui", "ux", "prototype", "mockup", "figma", "visual", "brand"],
  pm: ["project", "plan", "schedule", "timeline", "milestone", "delivery", "release", "product"],
  devops: ["deploy", "ci/cd", "pipeline", "infrastructure", "docker", "kubernetes", "k8s", "terraform"],
  researcher: ["research", "investigate", "analyze", "study", "survey", "benchmark", "compare"],
  general: ["task", "work", "help", "assist", "general", "misc"],
};

function classifyIntent(prompt: string): { role: string; confidence: number; reason: string } {
  const lowerPrompt = prompt.toLowerCase();
  const scores: Record<string, number> = {};

  for (const [role, keywords] of Object.entries(ROLE_KEYWORDS)) {
    scores[role] = 0;
    for (const keyword of keywords) {
      if (lowerPrompt.includes(keyword)) {
        scores[role] += 1;
      }
    }
  }

  let bestRole = "general";
  let bestScore = 0;

  for (const [role, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestRole = role;
    }
  }

  const confidence = Math.min(bestScore / 3, 1);
  const reason = bestScore > 0
    ? `Matched keywords for ${AGENT_ROLE_LABELS[bestRole as keyof typeof AGENT_ROLE_LABELS]}`
    : "No strong match found; defaulting to General";

  return { role: bestRole, confidence, reason };
}

function generateIssueTitle(prompt: string, role: string): string {
  const label = AGENT_ROLE_LABELS[role as keyof typeof AGENT_ROLE_LABELS] ?? "Task";
  const truncated = prompt.length > 80 ? prompt.slice(0, 77) + "..." : prompt;
  return `[${label}] ${truncated}`;
}

function generateIssueDescription(prompt: string, role: string, reason: string): string {
  const label = AGENT_ROLE_LABELS[role as keyof typeof AGENT_ROLE_LABELS] ?? "General";
  return `## Task Request\n\n${prompt}\n\n---\n\n**Routed to:** ${label}\n**Reason:** ${reason}\n**Auto-created via AI Chatbot**`;
}

export function chatRoutes(db: Db) {
  const router = Router();
  const issueSvc = issueService(db);

  router.post("/chat/route", validate(chatRouteSchema), async (req, res) => {
    try {
    const { prompt, companyId } = req.body as { prompt: string; companyId: string };
    const sessionId = (req.body as Record<string, unknown>).sessionId as string | undefined;
    const provider = (req.body as Record<string, unknown>).provider as string | undefined;
    const model = (req.body as Record<string, unknown>).model as string | undefined;
    assertCompanyAccess(req, companyId);

    let classification: Awaited<ReturnType<typeof classifyTask>>;
    let routeResult: Awaited<ReturnType<typeof routeTask>>;
    let sessionRouting: Awaited<ReturnType<typeof routeSession>> | null = null;
    let cacheHit = false;
    let cacheSimilarityScore = 0;

    const overrides = provider || model ? { provider: provider ?? null, model: model ?? null } : undefined;

    if (sessionId) {
      // Session-level routing: classify once, lock for session
      sessionRouting = await routeSession({ sessionId, companyId, firstMessage: prompt }, db);
      classification = {
        complexity: sessionRouting.complexity,
        agentRole: sessionRouting.role,
        confidence: sessionRouting.confidence,
        reason: sessionRouting.reason,
        tokensUsed: { input: 0, output: 0 },
      };
      routeResult = {
        agentId: sessionRouting.agentId,
        agentName: sessionRouting.agentName,
        agentRole: sessionRouting.role,
        complexity: sessionRouting.complexity,
        confidence: sessionRouting.confidence,
        reason: sessionRouting.reason,
        wasOverridden: false,
        selectedModel: sessionRouting.selectedModel,
        provider: sessionRouting.provider,
      };
    } else {
      // Per-task routing: check prompt cache first
      const cached = lookupPromptCache(prompt);
      if (cached) {
        cacheHit = true;
        cacheSimilarityScore = 1.0; // exact or similarity hit
        classification = {
          complexity: cached.complexity,
          agentRole: cached.agentRole,
          confidence: cached.confidence,
          reason: "Prompt cache hit — similar task detected",
          tokensUsed: { input: 0, output: 0 },
        };
        routeResult = await routeTask(db, companyId, prompt, classification, {}, overrides);
        // Override with cached model if no explicit override
        if (!overrides?.model && cached.selectedModel) {
          routeResult.selectedModel = cached.selectedModel;
          routeResult.provider = getModelProvider(cached.selectedModel).provider;
        }
      } else {
        // No cache hit — run full classification
        classification = await classifyTask(prompt);
        routeResult = await routeTask(db, companyId, prompt, classification, {}, overrides);
        // Store in cache for future lookups
        storePromptCache(prompt, classification.complexity, classification.agentRole, routeResult.selectedModel ?? null, classification.confidence);
      }
    }

    const actor = getActorInfo(req);

    // Find the matched agent
    let matchedAgent = routeResult.agentId
      ? await db.select().from(agentsTable).where(eq(agentsTable.id, routeResult.agentId)).then(rows => rows[0] ?? null)
      : null;

    // Fallback chains (keep existing logic for compatibility)
    if (!matchedAgent && routeResult.agentRole === "frontend_engineer") {
      const fallbackEngineers = await db
        .select()
        .from(agentsTable)
        .where(
          and(
            eq(agentsTable.companyId, companyId),
            eq(agentsTable.role, "engineer"),
            eq(agentsTable.status, "active"),
          ),
        );
      matchedAgent = fallbackEngineers[0] ?? null;
    }

    if (!matchedAgent && routeResult.agentRole === "backend_engineer") {
      const fallbackEngineers = await db
        .select()
        .from(agentsTable)
        .where(
          and(
            eq(agentsTable.companyId, companyId),
            eq(agentsTable.role, "engineer"),
            eq(agentsTable.status, "active"),
          ),
        );
      matchedAgent = fallbackEngineers[0] ?? null;
    }

    if (!matchedAgent && routeResult.agentRole === "qa_tester") {
      const fallbackQa = await db
        .select()
        .from(agentsTable)
        .where(
          and(
            eq(agentsTable.companyId, companyId),
            eq(agentsTable.role, "qa"),
            eq(agentsTable.status, "active"),
          ),
        );
      matchedAgent = fallbackQa[0] ?? null;
    }

    // Calculate savings
    const savings = calculateRoutingSavings(classification, matchedAgent?.role ?? routeResult.agentRole);

    // Resolve model and provider before issue creation
    const resolvedModel = routeResult.selectedModel ?? sessionRouting?.selectedModel ?? null;
    const providerInfo = resolvedModel ? getModelProvider(resolvedModel) : { provider: routeResult.provider ?? "Default", apiKeyName: "KIMI_API_KEY", color: "#ff6b35" };

    const issue = await issueSvc.create(companyId, {
      title: generateIssueTitle(prompt, routeResult.agentRole),
      description: generateIssueDescription(prompt, routeResult.agentRole, routeResult.reason),
      status: matchedAgent ? "todo" : "backlog",
      priority: classification.complexity === "complex" ? "high" : classification.complexity === "medium" ? "medium" : "low",
      assigneeAgentId: matchedAgent?.id ?? null,
      assigneeUserId: null,
      createdByAgentId: actor.agentId ?? null,
      createdByUserId: actor.actorType === "user" ? actor.actorId : null,
      requestDepth: 0,
      projectId: null,
      projectWorkspaceId: null,
      goalId: null,
      parentId: null,
      blockedByIssueIds: undefined,
      inheritExecutionWorkspaceFromIssueId: null,
      billingCode: null,
      assigneeAdapterOverrides: resolvedModel ? { selectedModel: resolvedModel, provider: providerInfo.provider } : null,
      executionPolicy: null,
      executionWorkspaceId: null,
      executionWorkspacePreference: null,
      executionWorkspaceSettings: null,
      labelIds: undefined,
    });

    // Store routing decision for cost tracking
    const classifierCostCents = Math.round(
      estimateCostFromTokens(
        classification.tokensUsed.input,
        classification.tokensUsed.output,
        "kimi-k2.5", // classifier model
      ) * 100,
    );
    console.log(
      `[RouterCost] classifier issue=${issue.id} complexity=${classification.complexity} ` +
      `tokens=${classification.tokensUsed.input}/${classification.tokensUsed.output} ` +
      `costCents=${classifierCostCents} role=${classification.agentRole} confidence=${classification.confidence}`
    );

    // Prompt hash for routing decision record
    const promptHash = hashPrompt(prompt);
    let estimatedLatencyMs: number | null = null;

    await db.insert(taskRoutingDecisions).values({
      companyId,
      issueId: issue.id,
      complexity: classification.complexity,
      classifiedRole: classification.agentRole,
      confidence: classification.confidence,
      classificationReason: classification.reason,
      routedAgentId: matchedAgent?.id ?? null,
      routedAgentRole: matchedAgent?.role ?? routeResult.agentRole,
      wasOverridden: routeResult.wasOverridden,
      overrideReason: routeResult.wasOverridden ? routeResult.reason : null,
      classifierInputTokens: classification.tokensUsed.input,
      classifierOutputTokens: classification.tokensUsed.output,
      estimatedSavingsPercent: savings.estimatedSavingsPercent,
      costEstimateCents: classifierCostCents,
      promptHash,
      cacheHit,
      cacheSimilarityScore,
      estimatedLatencyMs,
    });

    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "issue.created",
      entityType: "issue",
      entityId: issue.id,
      details: {
        title: issue.title,
        identifier: issue.identifier,
        via: "ai_chatbot",
        matchedRole: routeResult.agentRole,
        matchedAgentId: matchedAgent?.id ?? null,
        complexity: classification.complexity,
        confidence: classification.confidence,
        wasRouted: true,
      },
    });

    res.json({
      success: true,
      classification: {
        role: routeResult.agentRole,
        roleLabel: AGENT_ROLE_LABELS[routeResult.agentRole as keyof typeof AGENT_ROLE_LABELS] ?? routeResult.agentRole,
        complexity: classification.complexity,
        confidence: classification.confidence,
        reason: routeResult.reason,
        wasOverridden: routeResult.wasOverridden,
      },
      agent: matchedAgent
        ? {
            id: matchedAgent.id,
            name: matchedAgent.name,
            role: matchedAgent.role,
          }
        : null,
      issue: {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        url: `/issues/${issue.identifier}`,
      },
      routing: {
        estimatedSavingsPercent: savings.estimatedSavingsPercent,
        modelHint: classification.complexity,
        cacheHit,
        cacheSimilarityScore: cacheSimilarityScore > 0 ? Math.round(cacheSimilarityScore * 100) / 100 : 0,
        estimatedLatencyMs,
        sessionLocked: sessionRouting !== null,
        selectedModel: resolvedModel,
        provider: providerInfo.provider,
        apiKeyName: providerInfo.apiKeyName,
        providerColor: providerInfo.color,
      },
    });
    } catch (err) {
      console.error("[ChatRoute] Error:", err);
      res.status(500).json({ error: "Internal server error", details: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/chat/agents/:companyId", async (req, res) => {
    const companyId = req.params.companyId;
    assertCompanyAccess(req, companyId);

    const companyAgents = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.companyId, companyId));

    res.json({
      agents: companyAgents.map((agent: typeof agentsTable.$inferSelect) => ({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        roleLabel: AGENT_ROLE_LABELS[agent.role as keyof typeof AGENT_ROLE_LABELS] ?? agent.role,
        status: agent.status,
        icon: agent.icon,
      })),
    });
  });

  // Routing stats endpoint for cost dashboard
  router.get("/chat/routing-stats/:companyId", async (req, res) => {
    const companyId = req.params.companyId;
    assertCompanyAccess(req, companyId);

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Total decisions
    const allDecisions = await db
      .select()
      .from(taskRoutingDecisions)
      .where(eq(taskRoutingDecisions.companyId, companyId));

    // This week's decisions
    const weekDecisions = allDecisions.filter(d => new Date(d.createdAt) >= weekAgo);

    // Complexity breakdown
    const complexityCounts = { simple: 0, medium: 0, complex: 0 };
    for (const d of allDecisions) {
      if (d.complexity in complexityCounts) {
        complexityCounts[d.complexity as keyof typeof complexityCounts]++;
      }
    }

    // Total estimated savings
    const totalSavings = allDecisions.reduce((sum, d) => sum + (d.estimatedSavingsPercent || 0), 0);
    const avgSavings = allDecisions.length > 0 ? Math.round(totalSavings / allDecisions.length) : 0;

    // Weekly savings
    const weekSavings = weekDecisions.reduce((sum, d) => sum + (d.estimatedSavingsPercent || 0), 0);
    const avgWeekSavings = weekDecisions.length > 0 ? Math.round(weekSavings / weekDecisions.length) : 0;

    // Override stats
    const overrideCount = allDecisions.filter(d => d.wasOverridden).length;

    // Top routed agents
    const agentCounts: Record<string, { name: string; count: number }> = {};
    for (const d of allDecisions) {
      const role = d.routedAgentRole || "unknown";
      if (!agentCounts[role]) {
        agentCounts[role] = { name: AGENT_ROLE_LABELS[role as keyof typeof AGENT_ROLE_LABELS] || role, count: 0 };
      }
      agentCounts[role].count++;
    }
    const topAgents = Object.values(agentCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Real cost tracking: sum of actual costs from completed runs
    const totalCostCents = allDecisions.reduce((sum, d) => sum + (d.costEstimateCents || 0), 0);
    const weekCostCents = weekDecisions.reduce((sum, d) => sum + (d.costEstimateCents || 0), 0);
    const avgCostPerTask = allDecisions.length > 0 ? Math.round(totalCostCents / allDecisions.length) : 0;

    // Latency tracking: average actual latency from completed runs
    const latencies = allDecisions.map(d => d.latencyMs).filter((l): l is number => l != null && l > 0);
    const avgLatencyMs = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
    const weekLatencies = weekDecisions.map(d => d.latencyMs).filter((l): l is number => l != null && l > 0);
    const avgWeekLatencyMs = weekLatencies.length > 0 ? Math.round(weekLatencies.reduce((a, b) => a + b, 0) / weekLatencies.length) : 0;

    // Estimated latency (predicted at routing time)
    const estLatencies = allDecisions.map(d => d.estimatedLatencyMs).filter((l): l is number => l != null && l > 0);
    const avgEstimatedLatencyMs = estLatencies.length > 0 ? Math.round(estLatencies.reduce((a, b) => a + b, 0) / estLatencies.length) : 0;

    // Cache hit stats
    const cacheHits = allDecisions.filter(d => d.cacheHit).length;
    const avgCacheSimilarity = allDecisions.length > 0
      ? Math.round((allDecisions.reduce((sum, d) => sum + (d.cacheSimilarityScore || 0), 0) / allDecisions.length) * 100)
      : 0;

    res.json({
      totalDecisions: allDecisions.length,
      thisWeek: {
        count: weekDecisions.length,
        avgSavingsPercent: avgWeekSavings,
        costCents: weekCostCents,
        avgLatencyMs: avgWeekLatencyMs,
      },
      complexityBreakdown: complexityCounts,
      avgSavingsPercent: avgSavings,
      totalEstimatedSavingsPercent: totalSavings,
      overrideCount,
      overridePercent: allDecisions.length > 0 ? Math.round((overrideCount / allDecisions.length) * 100) : 0,
      topAgents,
      costTracking: {
        totalCostCents,
        avgCostPerTaskCents: avgCostPerTask,
        trackedTasks: allDecisions.filter(d => d.costEstimateCents > 0).length,
      },
      latencyTracking: {
        avgLatencyMs,
        avgEstimatedLatencyMs,
        trackedTasks: latencies.length,
      },
      cacheTracking: {
        cacheHits,
        cacheHitRate: allDecisions.length > 0 ? Math.round((cacheHits / allDecisions.length) * 100) : 0,
        avgSimilarityScore: avgCacheSimilarity,
      },
    });
  });

  // Cost trends endpoint (daily breakdown for charts)
  router.get("/chat/cost-trends/:companyId", async (req, res) => {
    const companyId = req.params.companyId;
    assertCompanyAccess(req, companyId);

    const now = new Date();
    const days = parseInt(req.query.days as string) || 14;
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const decisions = await db
      .select()
      .from(taskRoutingDecisions)
      .where(eq(taskRoutingDecisions.companyId, companyId));

    // Group by day
    const dailyData: Record<string, { date: string; tasks: number; costCents: number; savingsPercent: number }> = {};

    for (const d of decisions) {
      const date = new Date(d.createdAt).toISOString().split("T")[0];
      if (!dailyData[date]) {
        dailyData[date] = { date, tasks: 0, costCents: 0, savingsPercent: 0 };
      }
      dailyData[date].tasks += 1;
      dailyData[date].costCents += d.costEstimateCents || 0;
      dailyData[date].savingsPercent += d.estimatedSavingsPercent || 0;
    }

    // Fill in missing days with zeros
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split("T")[0];
      const dayData = dailyData[dateStr];
      result.push({
        date: dateStr,
        tasks: dayData?.tasks ?? 0,
        costCents: dayData?.costCents ?? 0,
        avgSavingsPercent: dayData ? Math.round(dayData.savingsPercent / dayData.tasks) : 0,
      });
    }

    res.json({
      days,
      daily: result,
      summary: {
        totalTasks: decisions.length,
        totalCostCents: decisions.reduce((s, d) => s + (d.costEstimateCents || 0), 0),
        avgSavingsPercent: decisions.length > 0
          ? Math.round(decisions.reduce((s, d) => s + (d.estimatedSavingsPercent || 0), 0) / decisions.length)
          : 0,
      },
    });
  });

  // Routing decisions list endpoint (for Model Router UI)
  router.get("/chat/routing-decisions/:companyId", async (req, res) => {
    const companyId = req.params.companyId;
    assertCompanyAccess(req, companyId);

    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const decisions = await db
      .select()
      .from(taskRoutingDecisions)
      .where(eq(taskRoutingDecisions.companyId, companyId))
      .orderBy(desc(taskRoutingDecisions.createdAt))
      .limit(limit)
      .offset(offset);

    // Map model to provider for display
    const getProviderFromModel = (model: string | null): string => {
      if (!model) return "unknown";
      if (model.startsWith("kimi")) return "Kimi";
      if (model.startsWith("gpt")) return "OpenAI";
      if (model.startsWith("gemini")) return "Google";
      if (model.startsWith("groq")) return "Groq";
      if (model.startsWith("claude")) return "Anthropic";
      return "unknown";
    };

    const getApiKeyFromModel = (model: string | null): string => {
      if (!model) return "unknown";
      if (model.startsWith("kimi")) return "KIMI_API_KEY";
      if (model.startsWith("gpt")) return "OPENAI_API_KEY";
      if (model.startsWith("gemini")) return "GEMINI_API_KEY";
      if (model.startsWith("groq")) return "GROQ_API_KEY";
      if (model.startsWith("claude")) return "ANTHROPIC_API_KEY";
      return "unknown";
    };

    res.json({
      decisions: decisions.map(d => ({
        id: d.id,
        issueId: d.issueId,
        complexity: d.complexity,
        classifiedRole: d.classifiedRole,
        confidence: d.confidence,
        routedAgentRole: d.routedAgentRole,
        wasOverridden: d.wasOverridden,
        model: d.agentModel,
        provider: getProviderFromModel(d.agentModel),
        apiKey: getApiKeyFromModel(d.agentModel),
        costEstimateCents: d.costEstimateCents,
        costSource: d.costSource,
        latencyMs: d.latencyMs,
        estimatedLatencyMs: d.estimatedLatencyMs,
        promptHash: d.promptHash,
        cacheHit: d.cacheHit,
        cacheSimilarityScore: d.cacheSimilarityScore,
        failoverModel: d.failoverModel,
        failoverReason: d.failoverReason,
        createdAt: d.createdAt,
      })),
      total: decisions.length,
    });
  });

  // Update model for a specific routing decision (manual override per-task)
  router.patch("/chat/routing/:issueId/model", async (req, res) => {
    const issueId = req.params.issueId;
    const { model } = req.body as { model?: string };

    if (!model || !model.trim()) {
      res.status(400).json({ error: "Model is required" });
      return;
    }

    // Update the routing decision for this issue
    const decisions = await db
      .select()
      .from(taskRoutingDecisions)
      .where(eq(taskRoutingDecisions.issueId, issueId))
      .orderBy(desc(taskRoutingDecisions.createdAt))
      .limit(1);

    if (decisions.length === 0) {
      res.status(404).json({ error: "Routing decision not found" });
      return;
    }

    const decision = decisions[0];
    assertCompanyAccess(req, decision.companyId);

    const providerInfo = getModelProvider(model);

    await db
      .update(taskRoutingDecisions)
      .set({
        agentModel: model,
        wasOverridden: true,
        overrideReason: `User manually selected model: ${model} (${providerInfo.provider})`,
        updatedAt: new Date(),
      })
      .where(eq(taskRoutingDecisions.id, decision.id));

    res.json({
      success: true,
      model,
      provider: providerInfo.provider,
      apiKeyName: providerInfo.apiKeyName,
      providerColor: providerInfo.color,
    });
  });

  // Attachment upload endpoint (stores metadata; returns URL)
  router.post("/chat/attachments", async (req, res) => {
    // For now, return a mock attachment since full file storage requires StorageService wiring
    const { name, type, size } = req.body as { name?: string; type?: string; size?: number };
    const attachmentId = randomUUID();
    res.json({
      id: attachmentId,
      name: name || "attachment",
      type: type || "application/octet-stream",
      size: size || 0,
      url: `/api/chat/attachments/${attachmentId}`,
    });
  });

  return router;
}
