import { Router } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents as agentsTable } from "@paperclipai/db";
import { AGENT_ROLE_LABELS } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { issueService } from "../services/index.js";
import { logActivity } from "../services/activity-log.js";

const chatRouteSchema = z.object({
  prompt: z.string().min(1).max(5000),
  companyId: z.string().uuid(),
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
    const { prompt, companyId } = req.body as { prompt: string; companyId: string };
    assertCompanyAccess(req, companyId);

    const classification = classifyIntent(prompt);

    const companyAgents = await db
      .select()
      .from(agentsTable)
      .where(
        and(
          eq(agentsTable.companyId, companyId),
          eq(agentsTable.role, classification.role),
          eq(agentsTable.status, "active"),
        ),
      );

    let matchedAgent = companyAgents[0] ?? null;

    if (!matchedAgent && classification.role === "frontend_engineer") {
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

    if (!matchedAgent && classification.role === "backend_engineer") {
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

    if (!matchedAgent && classification.role === "qa_tester") {
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

    const actor = getActorInfo(req);

    const issue = await issueSvc.create(companyId, {
      title: generateIssueTitle(prompt, classification.role),
      description: generateIssueDescription(prompt, classification.role, classification.reason),
      status: matchedAgent ? "todo" : "backlog",
      priority: "medium",
      assigneeAgentId: matchedAgent?.id ?? null,
      assigneeUserId: null,
      createdByAgentId: actor.agentId ?? null,
      createdByUserId: actor.actorType === "user" ? actor.actorId : null,
      workMode: "standard",
      requestDepth: 0,
      projectId: null,
      projectWorkspaceId: null,
      goalId: null,
      parentId: null,
      blockedByIssueIds: undefined,
      inheritExecutionWorkspaceFromIssueId: null,
      billingCode: null,
      assigneeAdapterOverrides: null,
      executionPolicy: null,
      executionWorkspaceId: null,
      executionWorkspacePreference: null,
      executionWorkspaceSettings: null,
      labelIds: undefined,
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
        matchedRole: classification.role,
        matchedAgentId: matchedAgent?.id ?? null,
      },
    });

    res.json({
      success: true,
      classification: {
        role: classification.role,
        roleLabel: AGENT_ROLE_LABELS[classification.role as keyof typeof AGENT_ROLE_LABELS] ?? classification.role,
        confidence: classification.confidence,
        reason: classification.reason,
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
        url: `/${issue.identifier}`,
      },
    });
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

  return router;
}
