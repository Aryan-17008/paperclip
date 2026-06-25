/**
 * LLM-powered task classifier for the Model Router.
 *
 * Uses Kimi K2.5 with a tiny max_tokens limit to classify task complexity
 * and determine the best agent role for routing.
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

export type Complexity = "simple" | "medium" | "complex";

export interface ClassificationResult {
  complexity: Complexity;
  agentRole: string;
  confidence: number;
  reason: string;
  tokensUsed: { input: number; output: number };
}

const CLASSIFIER_PROMPT = `You are a task routing classifier. Analyze the user request and output ONLY a JSON object with these exact fields:

- "complexity": "simple" | "medium" | "complex"
- "agentRole": one of [ceo, backend_engineer, frontend_engineer, qa, engineer, designer, devops, pm, researcher, security, cmo, general]
- "confidence": number 0.0-1.0
- "reason": brief explanation (max 20 words)

Rules:
- simple: straightforward tasks, single step, well-defined (fix typo, add button, run test)
- medium: multi-step, requires some analysis (debug error, refactor module, write API endpoint)
- complex: architectural, strategic, or deeply analytical (design system, plan roadmap, security audit)

Output ONLY valid JSON. No markdown, no explanation outside JSON.

Task: `;

function countTokens(text: string): number {
  // Rough estimate: ~4 chars per token for English text
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// Direct API call to Kimi (avoids broken Hermes CLI)
// ---------------------------------------------------------------------------

const KIMI_API_KEY = process.env.KIMI_API_KEY || "";
const KIMI_BASE_URL = process.env.KIMI_BASE_URL || "https://api.kimi.com/coding/v1";

async function callKimiClassifier(prompt: string): Promise<ClassificationResult | null> {
  if (!KIMI_API_KEY) {
    console.warn("[Classifier] No KIMI_API_KEY, using fallback");
    return null;
  }

  const fullPrompt = CLASSIFIER_PROMPT + prompt;
  const inputTokens = countTokens(fullPrompt);

  try {
    const response = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${KIMI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "kimi-k2.5",
        messages: [{ role: "user", content: fullPrompt }],
        max_tokens: 100,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      console.warn("[Classifier] Kimi API error:", response.status, await response.text());
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const outputTokens = data.usage?.completion_tokens || countTokens(content);

    // Extract JSON from content
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : content;
    const result = JSON.parse(jsonStr);

    return {
      complexity: validateComplexity(result.complexity),
      agentRole: validateAgentRole(result.agentRole),
      confidence: Math.min(Math.max(Number(result.confidence) || 0.5, 0), 1),
      reason: String(result.reason || "No reason provided").slice(0, 100),
      tokensUsed: { input: inputTokens, output: outputTokens },
    };
  } catch (err) {
    console.warn("[Classifier] API call failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function classifyTask(prompt: string): Promise<ClassificationResult> {
  // Try direct API first
  const apiResult = await callKimiClassifier(prompt);
  if (apiResult) return apiResult;

  // Fallback to rule-based
  console.warn("[Classifier] Using fallback classification");
  return fallbackClassify(prompt);
}

function validateComplexity(c: string): Complexity {
  if (c === "simple" || c === "medium" || c === "complex") return c;
  return "medium";
}

function validateAgentRole(role: string): string {
  const validRoles = [
    "ceo", "backend_engineer", "frontend_engineer", "qa", "engineer",
    "designer", "devops", "pm", "researcher", "security", "cmo", "general",
  ];
  if (validRoles.includes(role)) return role;
  return "general";
}

// ---------------------------------------------------------------------------
// Fallback: rule-based keyword matching when LLM classifier fails
// ---------------------------------------------------------------------------

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

const COMPLEXITY_KEYWORDS: Record<Complexity, string[]> = {
  simple: ["fix typo", "add button", "update text", "change color", "rename", "small", "quick", "minor"],
  medium: ["debug", "refactor", "implement", "create", "build", "fix bug", "add feature", "update"],
  complex: ["design", "architect", "plan", "strategy", "roadmap", "audit", "review", "migrate", "restructure"],
};

function fallbackClassify(prompt: string): ClassificationResult {
  const lowerPrompt = prompt.toLowerCase();

  // Role classification
  const roleScores: Record<string, number> = {};
  for (const [role, keywords] of Object.entries(ROLE_KEYWORDS)) {
    roleScores[role] = 0;
    for (const keyword of keywords) {
      if (lowerPrompt.includes(keyword)) roleScores[role] += 1;
    }
  }

  let bestRole = "general";
  let bestScore = 0;
  for (const [role, score] of Object.entries(roleScores)) {
    if (score > bestScore) {
      bestScore = score;
      bestRole = role;
    }
  }

  // Complexity classification
  const complexityScores: Record<Complexity, number> = { simple: 0, medium: 0, complex: 0 };
  for (const [complexity, keywords] of Object.entries(COMPLEXITY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerPrompt.includes(keyword)) complexityScores[complexity as Complexity] += 1;
    }
  }

  let bestComplexity: Complexity = "medium";
  let bestComplexityScore = 0;
  for (const [complexity, score] of Object.entries(complexityScores)) {
    if (score > bestComplexityScore) {
      bestComplexityScore = score;
      bestComplexity = complexity as Complexity;
    }
  }

  const confidence = Math.min(bestScore / 3, 1);
  const reason = bestScore > 0
    ? `Fallback: matched keywords for ${bestRole}`
    : "Fallback: no strong match, defaulting to general";
  const inputTokens = countTokens(prompt);
  const outputTokens = countTokens(reason); // estimate output based on response length

  return {
    complexity: bestComplexity,
    agentRole: bestRole,
    confidence,
    reason,
    tokensUsed: { input: inputTokens, output: outputTokens },
  };
}
