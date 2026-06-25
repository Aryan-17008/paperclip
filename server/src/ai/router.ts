/**
 * Model Router Engine
 *
 * Routes tasks to the most appropriate agent based on classification results.
 * Supports complexity-based routing, manual overrides, and fallback logic.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { Db } from "@paperclipai/db";
import { agents as agentsTable } from "@paperclipai/db";
import { eq, and } from "drizzle-orm";
import type { ClassificationResult, Complexity } from "./classifier.js";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";

export interface RouterConfig {
  // Complexity thresholds for routing decisions
  simpleThreshold: number;
  mediumThreshold: number;
  // Whether to allow round-robin for simple tasks
  enableRoundRobin: boolean;
  // Default agent when no match found
  defaultRole: string;
}

export interface RouteResult {
  agentId: string | null;
  agentName: string | null;
  agentRole: string;
  complexity: Complexity;
  confidence: number;
  reason: string;
  wasOverridden: boolean;
  overrideAgentId?: string;
  selectedModel?: string | null;
  provider?: string | null;
}

const DEFAULT_CONFIG: RouterConfig = {
  simpleThreshold: 0.3,
  mediumThreshold: 0.6,
  enableRoundRobin: true,
  defaultRole: "ceo",
};

// Role fallback chains: if exact role not found, try these in order
const ROLE_FALLBACKS: Record<string, string[]> = {
  frontend_engineer: ["engineer", "backend_engineer"],
  backend_engineer: ["engineer", "frontend_engineer"],
  qa_tester: ["qa"],
  qa: ["qa_tester"],
  cto: ["ceo", "engineer"],
  engineer: ["backend_engineer", "frontend_engineer"],
};

// Complexity-based model selection hints
const COMPLEXITY_MODEL_HINTS: Record<Complexity, { maxTokens: number; reasoning?: string }> = {
  simple: { maxTokens: 2000, reasoning: "fast" },
  medium: { maxTokens: 8000, reasoning: "medium" },
  complex: { maxTokens: 32000, reasoning: "deep" },
};

// Per-request model switching: map complexity to model name
// These can be overridden via model-router-config.json
const DEFAULT_COMPLEXITY_MODELS: Record<Complexity, string> = {
  simple: "kimi-k1",
  medium: "kimi-k1.5",
  complex: "kimi-k2.5",
};

let cachedComplexityModels: Record<Complexity, string> | null = null;
let cachedComplexityModelsMtime: number | null = null;

async function loadComplexityModels(): Promise<Record<Complexity, string>> {
  try {
    const configPath = path.join(resolvePaperclipInstanceRoot(), "model-router-config.json");
    const stat = await fs.stat(configPath).catch(() => null);
    if (!stat) {
      return DEFAULT_COMPLEXITY_MODELS;
    }
    if (cachedComplexityModels && cachedComplexityModelsMtime === stat.mtimeMs) {
      return cachedComplexityModels;
    }
    const raw = await fs.readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    const models = parsed?.complexityModels;
    if (models && typeof models === "object") {
      const validated: Partial<Record<Complexity, string>> = {};
      for (const key of ["simple", "medium", "complex"] as Complexity[]) {
        if (typeof models[key] === "string" && models[key].trim()) {
          validated[key] = models[key].trim();
        }
      }
      if (Object.keys(validated).length > 0) {
        cachedComplexityModels = { ...DEFAULT_COMPLEXITY_MODELS, ...validated };
        cachedComplexityModelsMtime = stat.mtimeMs;
        return cachedComplexityModels;
      }
    }
  } catch {
    // ignore parse errors, fall through to defaults
  }
  return DEFAULT_COMPLEXITY_MODELS;
}

// ── Provider Failover Config ─────────────────────────────────────────

export interface ProviderFailoverConfig {
  enabled: boolean;
  maxRetries: number;
  retryDelayMs: number;
  fallbackChains: Record<string, string[]>;
}

const DEFAULT_FAILOVER_CONFIG: ProviderFailoverConfig = {
  enabled: false,
  maxRetries: 1,
  retryDelayMs: 1000,
  fallbackChains: {},
};

let cachedFailoverConfig: ProviderFailoverConfig | null = null;
let cachedFailoverConfigMtime: number | null = null;

export async function loadProviderFailoverConfig(): Promise<ProviderFailoverConfig> {
  try {
    const configPath = path.join(resolvePaperclipInstanceRoot(), "model-router-config.json");
    const stat = await fs.stat(configPath).catch(() => null);
    if (!stat) {
      return DEFAULT_FAILOVER_CONFIG;
    }
    if (cachedFailoverConfig && cachedFailoverConfigMtime === stat.mtimeMs) {
      return cachedFailoverConfig;
    }
    const raw = await fs.readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    const failover = parsed?.providerFailover;
    if (failover && typeof failover === "object") {
      const validated: ProviderFailoverConfig = {
        enabled: typeof failover.enabled === "boolean" ? failover.enabled : DEFAULT_FAILOVER_CONFIG.enabled,
        maxRetries: typeof failover.maxRetries === "number" ? failover.maxRetries : DEFAULT_FAILOVER_CONFIG.maxRetries,
        retryDelayMs: typeof failover.retryDelayMs === "number" ? failover.retryDelayMs : DEFAULT_FAILOVER_CONFIG.retryDelayMs,
        fallbackChains: {},
      };
      const chains = failover.fallbackChains;
      if (chains && typeof chains === "object") {
        for (const [model, fallbacks] of Object.entries(chains)) {
          if (Array.isArray(fallbacks) && fallbacks.every((f) => typeof f === "string")) {
            validated.fallbackChains[model] = fallbacks as string[];
          }
        }
      }
      cachedFailoverConfig = validated;
      cachedFailoverConfigMtime = stat.mtimeMs;
      return validated;
    }
  } catch (err) {
    console.warn("[ProviderFailover] Failed to load config:", err instanceof Error ? err.message : String(err));
  }
  return DEFAULT_FAILOVER_CONFIG;
}

/**
 * Get the fallback chain for a model.
 * Returns empty array if failover disabled or no chain configured.
 */
export async function getModelFallbackChain(model: string): Promise<string[]> {
  const config = await loadProviderFailoverConfig();
  if (!config.enabled) return [];
  return config.fallbackChains[model] ?? [];
}

/**
 * Check if provider failover is enabled.
 */
export async function isProviderFailoverEnabled(): Promise<boolean> {
  const config = await loadProviderFailoverConfig();
  return config.enabled;
}

/**
 * Get max retries per model attempt.
 */
export async function getFailoverMaxRetries(): Promise<number> {
  const config = await loadProviderFailoverConfig();
  return config.maxRetries;
}

/**
 * Get retry delay between attempts.
 */
export async function getFailoverRetryDelayMs(): Promise<number> {
  const config = await loadProviderFailoverConfig();
  return config.retryDelayMs;
}

// ── Latency Optimization Config ──────────────────────────────────────

export interface LatencyOptimizationConfig {
  enabled: boolean;
  latencyThresholdMs: number;
  maxLatencyHistory: number;
  latencyWeight: number;
  costWeight: number;
}

const DEFAULT_LATENCY_CONFIG: LatencyOptimizationConfig = {
  enabled: true,
  latencyThresholdMs: 5000,
  maxLatencyHistory: 50,
  latencyWeight: 0.3,
  costWeight: 0.7,
};

let cachedLatencyConfig: LatencyOptimizationConfig | null = null;
let cachedLatencyConfigMtime: number | null = null;

export async function loadLatencyConfig(): Promise<LatencyOptimizationConfig> {
  try {
    const configPath = path.join(resolvePaperclipInstanceRoot(), "model-router-config.json");
    const stat = await fs.stat(configPath).catch(() => null);
    if (!stat) return DEFAULT_LATENCY_CONFIG;
    if (cachedLatencyConfig && cachedLatencyConfigMtime === stat.mtimeMs) return cachedLatencyConfig;
    const raw = await fs.readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    const latency = parsed?.latencyOptimization;
    if (latency && typeof latency === "object") {
      const validated: LatencyOptimizationConfig = {
        enabled: typeof latency.enabled === "boolean" ? latency.enabled : DEFAULT_LATENCY_CONFIG.enabled,
        latencyThresholdMs: typeof latency.latencyThresholdMs === "number" ? latency.latencyThresholdMs : DEFAULT_LATENCY_CONFIG.latencyThresholdMs,
        maxLatencyHistory: typeof latency.maxLatencyHistory === "number" ? latency.maxLatencyHistory : DEFAULT_LATENCY_CONFIG.maxLatencyHistory,
        latencyWeight: typeof latency.latencyWeight === "number" ? latency.latencyWeight : DEFAULT_LATENCY_CONFIG.latencyWeight,
        costWeight: typeof latency.costWeight === "number" ? latency.costWeight : DEFAULT_LATENCY_CONFIG.costWeight,
      };
      cachedLatencyConfig = validated;
      cachedLatencyConfigMtime = stat.mtimeMs;
      return validated;
    }
  } catch (err) {
    console.warn("[LatencyConfig] Failed to load:", err instanceof Error ? err.message : String(err));
  }
  return DEFAULT_LATENCY_CONFIG;
}

// ── Real-time Performance Feedback ───────────────────────────────────

interface PerformanceSample {
  latencyMs: number;
  costCents: number;
  inputTokens: number;
  outputTokens: number;
  success: boolean;
  timestamp: number;
}

const performanceHistory: Map<string, PerformanceSample[]> = new Map();

export function recordModelPerformance(
  model: string,
  latencyMs: number,
  costCents: number,
  inputTokens: number,
  outputTokens: number,
  success: boolean,
): void {
  const samples = performanceHistory.get(model) ?? [];
  samples.push({
    latencyMs,
    costCents,
    inputTokens,
    outputTokens,
    success,
    timestamp: Date.now(),
  });
  // Keep only recent samples
  const config = cachedLatencyConfig ?? DEFAULT_LATENCY_CONFIG;
  while (samples.length > config.maxLatencyHistory) samples.shift();
  performanceHistory.set(model, samples);
}

export function getAverageLatency(model: string): number | null {
  const samples = performanceHistory.get(model);
  if (!samples || samples.length === 0) return null;
  return samples.reduce((a, b) => a + b.latencyMs, 0) / samples.length;
}

export function getAverageCost(model: string): number | null {
  const samples = performanceHistory.get(model);
  if (!samples || samples.length === 0) return null;
  return samples.reduce((a, b) => a + b.costCents, 0) / samples.length;
}

export function getSuccessRate(model: string): number | null {
  const samples = performanceHistory.get(model);
  if (!samples || samples.length === 0) return null;
  const successes = samples.filter((s) => s.success).length;
  return successes / samples.length;
}

export function getPerformanceStats(model: string): {
  avgLatencyMs: number | null;
  avgCostCents: number | null;
  successRate: number | null;
  sampleCount: number;
} {
  const samples = performanceHistory.get(model);
  if (!samples || samples.length === 0) {
    return { avgLatencyMs: null, avgCostCents: null, successRate: null, sampleCount: 0 };
  }
  const avgLatencyMs = samples.reduce((a, b) => a + b.latencyMs, 0) / samples.length;
  const avgCostCents = samples.reduce((a, b) => a + b.costCents, 0) / samples.length;
  const successes = samples.filter((s) => s.success).length;
  return {
    avgLatencyMs,
    avgCostCents,
    successRate: successes / samples.length,
    sampleCount: samples.length,
  };
}

// Legacy alias for backward compatibility
export function recordModelLatency(model: string, latencyMs: number): void {
  recordModelPerformance(model, latencyMs, 0, 0, 0, true);
}

// ── Rate Limit Tracking ──────────────────────────────────────────────

interface RateLimitEntry {
  model: string;
  retryAfterMs: number;
  hitAt: number;
}

const rateLimitLog: Map<string, RateLimitEntry> = new Map();

/**
 * Record a rate limit (429) hit for a model.
 */
export function recordRateLimit(model: string, retryAfterMs: number = 60_000): void {
  rateLimitLog.set(model, {
    model,
    retryAfterMs,
    hitAt: Date.now(),
  });
  console.log(`[RateLimit] Model ${model} rate limited. Retry after ${retryAfterMs}ms`);
}

/**
 * Check if a model is currently rate-limited.
 */
export function isRateLimited(model: string): boolean {
  const entry = rateLimitLog.get(model);
  if (!entry) return false;
  const elapsed = Date.now() - entry.hitAt;
  if (elapsed >= entry.retryAfterMs) {
    rateLimitLog.delete(model); // cleared
    return false;
  }
  return true;
}

/**
 * Get remaining cooldown for a rate-limited model.
 */
export function getRateLimitCooldownMs(model: string): number {
  const entry = rateLimitLog.get(model);
  if (!entry) return 0;
  const remaining = entry.retryAfterMs - (Date.now() - entry.hitAt);
  return Math.max(0, remaining);
}

/**
 * Select the best model for a given complexity level, considering latency, cost, and reliability.
 * Returns the model name to use for this request.
 */
export async function selectModelForComplexity(complexity: Complexity): Promise<string> {
  const models = await loadComplexityModels();
  const baseModel = models[complexity] ?? DEFAULT_COMPLEXITY_MODELS[complexity];

  const latencyConfig = await loadLatencyConfig();
  if (!latencyConfig.enabled) return baseModel;

  // Get all models for this complexity tier (including fallbacks)
  const candidates = [baseModel, ...(await getModelFallbackChain(baseModel))];
  const uniqueCandidates = [...new Set(candidates)];

  // Score each candidate by weighted cost + latency + reliability
  let bestModel = baseModel;
  let bestScore = Infinity;

  for (const model of uniqueCandidates) {
    // Skip rate-limited models
    if (isRateLimited(model)) {
      const cooldown = getRateLimitCooldownMs(model);
      console.log(`[RateLimit] Skipping ${model} (cooldown: ${cooldown}ms)`);
      continue;
    }

    const pricing = MODEL_PRICING[model] ?? MODEL_PRICING.default;
    const stats = getPerformanceStats(model);

    // Normalize cost (input + output per 1k) — prefer actual cost if available
    const costScore = stats.avgCostCents
      ? stats.avgCostCents / 100 // convert cents to USD-like score
      : (pricing.inputPer1k + pricing.outputPer1k) * 1000;

    // Normalize latency — prefer actual if available, otherwise threshold
    const latencyScore = stats.avgLatencyMs ?? latencyConfig.latencyThresholdMs;

    // Reliability penalty: high failure rate = higher score (worse)
    const reliabilityPenalty = stats.successRate != null
      ? (1 - stats.successRate) * 1000 // up to +1000 penalty for 0% success
      : 0; // no data = no penalty

    // Combined score: lower is better
    const score =
      (latencyConfig.costWeight * costScore) +
      (latencyConfig.latencyWeight * (latencyScore / 1000)) +
      reliabilityPenalty;

    if (score < bestScore) {
      bestScore = score;
      bestModel = model;
    }
  }

  if (bestModel !== baseModel) {
    const bestStats = getPerformanceStats(bestModel);
    console.log(
      `[LatencyOpt] complexity=${complexity} base=${baseModel} selected=${bestModel} ` +
      `latency=${bestStats.avgLatencyMs?.toFixed(0) ?? "N/A"}ms ` +
      `cost=${bestStats.avgCostCents?.toFixed(2) ?? "N/A"}c ` +
      `success=${bestStats.successRate != null ? (bestStats.successRate * 100).toFixed(0) : "N/A"}% ` +
      `n=${bestStats.sampleCount}`
    );
  }

  return bestModel;
}

// ── Pareto Frontier Multi-Objective Model Selection ───────────────────

export interface ModelProfile {
  model: string;
  costPer1k: number;      // input + output per 1k tokens (cents)
  latencyMs: number;     // average latency (or threshold if no data)
  qualityScore: number;  // 0-1, higher is better (based on model tier)
  contextWindow: number; // max tokens
}

export interface ParetoConfig {
  enabled: boolean;
  objectives: ("cost" | "latency" | "quality")[];
  qualityThreshold: number; // minimum quality score (0-1)
  maxLatencyMs: number;     // hard latency ceiling
  maxCostPer1k: number;     // hard cost ceiling (cents)
}

const DEFAULT_PARETO_CONFIG: ParetoConfig = {
  enabled: false,
  objectives: ["cost", "latency"],
  qualityThreshold: 0.5,
  maxLatencyMs: 30000,
  maxCostPer1k: 50,
};

// Model quality tiers (0-1 scale)
const MODEL_QUALITY_TIERS: Record<string, number> = {
  "kimi-k1": 0.6,
  "kimi-k1.5": 0.75,
  "kimi-k2.5": 0.9,
  "gpt-4o-mini": 0.65,
  "gpt-4o": 0.85,
  "gpt-4.5": 0.92,
  "gemini-1.5-flash": 0.7,
  "gemini-1.5-pro": 0.88,
  "gemini-2.0-flash": 0.78,
  "gemini-2.5-pro": 0.93,
  "groq-llama-3.1-8b": 0.55,
  "groq-llama-3.1-70b": 0.75,
  "groq-llama-3.3-70b": 0.8,
  "groq-mixtral-8x7b": 0.7,
};

// Model → Provider mapping
export function getModelProvider(modelName: string): { provider: string; apiKeyName: string; color: string } {
  const m = modelName.toLowerCase();
  if (m.startsWith("kimi-")) return { provider: "Kimi", apiKeyName: "KIMI_API_KEY", color: "#ff6b35" };
  if (m.startsWith("gpt-")) return { provider: "OpenAI", apiKeyName: "OPENAI_API_KEY", color: "#10a37f" };
  if (m.startsWith("gemini-")) return { provider: "Gemini", apiKeyName: "GEMINI_API_KEY", color: "#4285f4" };
  if (m.startsWith("groq-")) return { provider: "Groq", apiKeyName: "GROQ_API_KEY", color: "#f55036" };
  if (m.includes("claude")) return { provider: "Anthropic", apiKeyName: "ANTHROPIC_API_KEY", color: "#d4a574" };
  return { provider: "Unknown", apiKeyName: "UNKNOWN_API_KEY", color: "#888888" };
}

// Model context windows (tokens)
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  "kimi-k1": 128000,
  "kimi-k1.5": 128000,
  "kimi-k2.5": 256000,
  "gpt-4o-mini": 128000,
  "gpt-4o": 128000,
  "gpt-4.5": 128000,
  "gemini-1.5-flash": 1000000,
  "gemini-1.5-pro": 2000000,
  "gemini-2.0-flash": 1000000,
  "gemini-2.5-pro": 1000000,
  "groq-llama-3.1-8b": 128000,
  "groq-llama-3.1-70b": 128000,
  "groq-llama-3.3-70b": 128000,
  "groq-mixtral-8x7b": 32000,
};

let cachedParetoConfig: ParetoConfig | null = null;
let cachedParetoConfigMtime: number | null = null;

export async function loadParetoConfig(): Promise<ParetoConfig> {
  try {
    const configPath = path.join(resolvePaperclipInstanceRoot(), "model-router-config.json");
    const stat = await fs.stat(configPath).catch(() => null);
    if (!stat) return DEFAULT_PARETO_CONFIG;
    if (cachedParetoConfig && cachedParetoConfigMtime === stat.mtimeMs) return cachedParetoConfig;
    const raw = await fs.readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    const pareto = parsed?.paretoOptimization;
    if (pareto && typeof pareto === "object") {
      const objectives = Array.isArray(pareto.objectives)
        ? pareto.objectives.filter((o: string) => ["cost", "latency", "quality"].includes(o))
        : DEFAULT_PARETO_CONFIG.objectives;
      const validated: ParetoConfig = {
        enabled: typeof pareto.enabled === "boolean" ? pareto.enabled : DEFAULT_PARETO_CONFIG.enabled,
        objectives: objectives.length > 0 ? objectives : DEFAULT_PARETO_CONFIG.objectives,
        qualityThreshold: typeof pareto.qualityThreshold === "number" ? pareto.qualityThreshold : DEFAULT_PARETO_CONFIG.qualityThreshold,
        maxLatencyMs: typeof pareto.maxLatencyMs === "number" ? pareto.maxLatencyMs : DEFAULT_PARETO_CONFIG.maxLatencyMs,
        maxCostPer1k: typeof pareto.maxCostPer1k === "number" ? pareto.maxCostPer1k : DEFAULT_PARETO_CONFIG.maxCostPer1k,
      };
      cachedParetoConfig = validated;
      cachedParetoConfigMtime = stat.mtimeMs;
      return validated;
    }
  } catch (err) {
    console.warn("[ParetoConfig] Failed to load:", err instanceof Error ? err.message : String(err));
  }
  return DEFAULT_PARETO_CONFIG;
}

/**
 * Build a model profile for Pareto analysis.
 */
function buildModelProfile(model: string): ModelProfile {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING.default;
  const avgLatency = getAverageLatency(model);
  const latencyMs = avgLatency ?? DEFAULT_LATENCY_CONFIG.latencyThresholdMs;
  const costPer1k = pricing.inputPer1k + pricing.outputPer1k;
  return {
    model,
    costPer1k,
    latencyMs,
    qualityScore: MODEL_QUALITY_TIERS[model] ?? 0.5,
    contextWindow: MODEL_CONTEXT_WINDOWS[model] ?? 128000,
  };
}

/**
 * Check if candidate A dominates candidate B on all objectives.
 * Lower cost and latency are better. Higher quality is better.
 */
function dominates(a: ModelProfile, b: ModelProfile, objectives: ("cost" | "latency" | "quality")[]): boolean {
  let strictlyBetter = false;
  for (const obj of objectives) {
    if (obj === "cost") {
      if (a.costPer1k > b.costPer1k) return false;
      if (a.costPer1k < b.costPer1k) strictlyBetter = true;
    } else if (obj === "latency") {
      if (a.latencyMs > b.latencyMs) return false;
      if (a.latencyMs < b.latencyMs) strictlyBetter = true;
    } else if (obj === "quality") {
      if (a.qualityScore < b.qualityScore) return false;
      if (a.qualityScore > b.qualityScore) strictlyBetter = true;
    }
  }
  return strictlyBetter;
}

/**
 * Compute the Pareto frontier: models that are not dominated by any other.
 */
function computeParetoFrontier(profiles: ModelProfile[], objectives: ("cost" | "latency" | "quality")[]): ModelProfile[] {
  const frontier: ModelProfile[] = [];
  for (const candidate of profiles) {
    let dominated = false;
    for (const other of profiles) {
      if (candidate.model === other.model) continue;
      if (dominates(other, candidate, objectives)) {
        dominated = true;
        break;
      }
    }
    if (!dominated) frontier.push(candidate);
  }
  return frontier;
}

/**
 * Select best model using Pareto frontier multi-objective optimization.
 * Falls back to weighted scoring if Pareto is disabled.
 */
export async function selectModelPareto(complexity: Complexity, requiredTokens?: number): Promise<{ model: string; frontier: ModelProfile[]; selected: ModelProfile }> {
  const paretoConfig = await loadParetoConfig();
  const models = await loadComplexityModels();
  const baseModel = models[complexity] ?? DEFAULT_COMPLEXITY_MODELS[complexity];

  // Build candidate pool: base + fallbacks + all known models in tier
  const candidates = [baseModel, ...(await getModelFallbackChain(baseModel))];
  const allModels = Object.keys(MODEL_PRICING).filter(m => m !== "default");
  const uniqueCandidates = [...new Set([...candidates, ...allModels])];

  const profiles = uniqueCandidates.map(buildModelProfile);

  // Apply hard constraints
  const feasible = profiles.filter(p =>
    p.qualityScore >= paretoConfig.qualityThreshold &&
    p.latencyMs <= paretoConfig.maxLatencyMs &&
    p.costPer1k <= paretoConfig.maxCostPer1k &&
    (!requiredTokens || p.contextWindow >= requiredTokens)
  );

  if (feasible.length === 0) {
    // No feasible model, fall back to base
    const baseProfile = buildModelProfile(baseModel);
    return { model: baseModel, frontier: [baseProfile], selected: baseProfile };
  }

  if (!paretoConfig.enabled) {
    // Use simple weighted scoring
    const latencyConfig = await loadLatencyConfig();
    let best = feasible[0];
    let bestScore = Infinity;
    for (const p of feasible) {
      const score = (latencyConfig.costWeight * p.costPer1k) + (latencyConfig.latencyWeight * (p.latencyMs / 1000));
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return { model: best.model, frontier: feasible, selected: best };
  }

  // Compute Pareto frontier
  const frontier = computeParetoFrontier(feasible, paretoConfig.objectives);

  // Select from frontier using lexicographic preference (first objective wins)
  const primary = paretoConfig.objectives[0] ?? "cost";
  let selected = frontier[0];
  for (const p of frontier) {
    if (primary === "cost" && p.costPer1k < selected.costPer1k) selected = p;
    else if (primary === "latency" && p.latencyMs < selected.latencyMs) selected = p;
    else if (primary === "quality" && p.qualityScore > selected.qualityScore) selected = p;
  }

  console.log(`[Pareto] complexity=${complexity} frontier=${frontier.length} selected=${selected.model} primary=${primary}`);
  return { model: selected.model, frontier, selected };
}

// ── Prompt Cache Awareness Config ────────────────────────────────────

export interface PromptCacheConfig {
  enabled: boolean;
  similarityThreshold: number;
  cacheWindowHours: number;
  maxCacheEntries: number;
}

const DEFAULT_PROMPT_CACHE_CONFIG: PromptCacheConfig = {
  enabled: true,
  similarityThreshold: 0.85,
  cacheWindowHours: 24,
  maxCacheEntries: 100,
};

let cachedPromptCacheConfig: PromptCacheConfig | null = null;
let cachedPromptCacheConfigMtime: number | null = null;

export async function loadPromptCacheConfig(): Promise<PromptCacheConfig> {
  try {
    const configPath = path.join(resolvePaperclipInstanceRoot(), "model-router-config.json");
    const stat = await fs.stat(configPath).catch(() => null);
    if (!stat) return DEFAULT_PROMPT_CACHE_CONFIG;
    if (cachedPromptCacheConfig && cachedPromptCacheConfigMtime === stat.mtimeMs) return cachedPromptCacheConfig;
    const raw = await fs.readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    const cache = parsed?.promptCache;
    if (cache && typeof cache === "object") {
      const validated: PromptCacheConfig = {
        enabled: typeof cache.enabled === "boolean" ? cache.enabled : DEFAULT_PROMPT_CACHE_CONFIG.enabled,
        similarityThreshold: typeof cache.similarityThreshold === "number" ? cache.similarityThreshold : DEFAULT_PROMPT_CACHE_CONFIG.similarityThreshold,
        cacheWindowHours: typeof cache.cacheWindowHours === "number" ? cache.cacheWindowHours : DEFAULT_PROMPT_CACHE_CONFIG.cacheWindowHours,
        maxCacheEntries: typeof cache.maxCacheEntries === "number" ? cache.maxCacheEntries : DEFAULT_PROMPT_CACHE_CONFIG.maxCacheEntries,
      };
      cachedPromptCacheConfig = validated;
      cachedPromptCacheConfigMtime = stat.mtimeMs;
      return validated;
    }
  } catch (err) {
    console.warn("[PromptCacheConfig] Failed to load:", err instanceof Error ? err.message : String(err));
  }
  return DEFAULT_PROMPT_CACHE_CONFIG;
}

/**
 * Simple hash function for prompt content (not cryptographic, just for matching)
 */
export function hashPrompt(prompt: string): string {
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    const char = prompt.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36).padStart(8, "0");
}

/**
 * Simple similarity score between two prompts (0-1)
 */
export function promptSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  const aWords = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const bWords = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (aWords.size === 0 || bWords.size === 0) return 0;
  const intersection = new Set([...aWords].filter(w => bWords.has(w)));
  const union = new Set([...aWords, ...bWords]);
  return intersection.size / union.size;
}

// ── Prompt Cache Store ───────────────────────────────────────────────

interface CachedPrompt {
  promptHash: string;
  promptPreview: string; // first 100 chars for debugging
  complexity: Complexity;
  agentRole: string;
  selectedModel: string | null;
  confidence: number;
  timestamp: number;
}

const promptCache: Map<string, CachedPrompt> = new Map();

/**
 * Store a prompt classification result in the cache.
 */
export function storePromptCache(
  prompt: string,
  complexity: Complexity,
  agentRole: string,
  selectedModel: string | null,
  confidence: number,
): void {
  const config = cachedPromptCacheConfig ?? DEFAULT_PROMPT_CACHE_CONFIG;
  if (!config.enabled) return;

  const promptHash = hashPrompt(prompt);
  const preview = prompt.slice(0, 100);

  promptCache.set(promptHash, {
    promptHash,
    promptPreview: preview,
    complexity,
    agentRole,
    selectedModel,
    confidence,
    timestamp: Date.now(),
  });

  // Evict oldest entries if over limit
  if (promptCache.size > config.maxCacheEntries) {
    const oldest = [...promptCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    if (oldest) {
      promptCache.delete(oldest[0]);
      console.log(`[PromptCache] Evicted oldest entry: ${oldest[1].promptPreview.slice(0, 30)}...`);
    }
  }

  console.log(`[PromptCache] Stored: hash=${promptHash} complexity=${complexity} role=${agentRole} model=${selectedModel}`);
}

/**
 * Look up a similar prompt in the cache.
 * Returns the cached result if a sufficiently similar prompt is found.
 */
export function lookupPromptCache(prompt: string): CachedPrompt | null {
  const config = cachedPromptCacheConfig ?? DEFAULT_PROMPT_CACHE_CONFIG;
  if (!config.enabled) return null;

  const promptHash = hashPrompt(prompt);
  const now = Date.now();
  const windowMs = config.cacheWindowHours * 3600 * 1000;

  // Exact hash match first
  const exact = promptCache.get(promptHash);
  if (exact && (now - exact.timestamp) <= windowMs) {
    console.log(`[PromptCache] Exact hit: hash=${promptHash} complexity=${exact.complexity}`);
    return exact;
  }

  // Similarity-based match
  let bestMatch: CachedPrompt | null = null;
  let bestScore = 0;

  for (const entry of promptCache.values()) {
    if (now - entry.timestamp > windowMs) continue; // expired
    const similarity = promptSimilarity(prompt, entry.promptPreview);
    if (similarity > bestScore && similarity >= config.similarityThreshold) {
      bestScore = similarity;
      bestMatch = entry;
    }
  }

  if (bestMatch) {
    console.log(`[PromptCache] Similarity hit: hash=${promptHash} match=${bestMatch.promptHash} score=${bestScore.toFixed(2)} complexity=${bestMatch.complexity}`);
  }

  return bestMatch;
}

/**
 * Get cache stats for monitoring.
 */
export function getPromptCacheStats(): { size: number; maxSize: number; enabled: boolean } {
  const config = cachedPromptCacheConfig ?? DEFAULT_PROMPT_CACHE_CONFIG;
  return {
    size: promptCache.size,
    maxSize: config.maxCacheEntries,
    enabled: config.enabled,
  };
}

// Model pricing: cost per 1K tokens (input / output) in USD
// Fallback for unknown models
export const MODEL_PRICING: Record<string, { inputPer1k: number; outputPer1k: number }> = {
  // Kimi models
  "kimi-k2.5": { inputPer1k: 0.00125, outputPer1k: 0.005 },
  "kimi-k1.5": { inputPer1k: 0.0008, outputPer1k: 0.002 },
  "kimi-k1": { inputPer1k: 0.0005, outputPer1k: 0.0015 },
  // OpenAI models
  "gpt-4o": { inputPer1k: 0.005, outputPer1k: 0.015 },
  "gpt-4o-mini": { inputPer1k: 0.00015, outputPer1k: 0.0006 },
  "gpt-4": { inputPer1k: 0.03, outputPer1k: 0.06 },
  "gpt-3.5-turbo": { inputPer1k: 0.0005, outputPer1k: 0.0015 },
  // Anthropic models
  "claude-sonnet-4": { inputPer1k: 0.003, outputPer1k: 0.015 },
  "claude-sonnet-4-0": { inputPer1k: 0.003, outputPer1k: 0.015 },
  "claude-opus-4": { inputPer1k: 0.015, outputPer1k: 0.075 },
  "claude-haiku": { inputPer1k: 0.00025, outputPer1k: 0.00125 },
  // Google models
  "gemini-2.5-pro": { inputPer1k: 0.00125, outputPer1k: 0.005 },
  "gemini-2.5-flash": { inputPer1k: 0.00015, outputPer1k: 0.0006 },
  // Groq models
  "groq-llama-3.3-70b": { inputPer1k: 0.00059, outputPer1k: 0.00079 },
  "groq-llama-3.1-8b": { inputPer1k: 0.00005, outputPer1k: 0.00008 },
  "groq-mixtral-8x7b": { inputPer1k: 0.00024, outputPer1k: 0.00024 },
  // Default fallback
  default: { inputPer1k: 0.001, outputPer1k: 0.003 },
};

/**
 * Estimate cost from token usage and model name.
 * Returns cost in USD.
 */
export function estimateCostFromTokens(
  inputTokens: number,
  outputTokens: number,
  model: string | null | undefined,
): number {
  const key = model && MODEL_PRICING[model] ? model : "default";
  const pricing = MODEL_PRICING[key];
  const inputCost = (inputTokens / 1000) * pricing.inputPer1k;
  const outputCost = (outputTokens / 1000) * pricing.outputPer1k;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000; // 6 decimal precision
}

/**
 * Check for manual override in prompt (e.g., "@backend fix this")
 */
function detectOverride(prompt: string): { role: string | null; cleanPrompt: string } {
  const overrideMatch = prompt.match(/^@(\w+)\s*/i);
  if (overrideMatch) {
    const role = overrideMatch[1].toLowerCase();
    const cleanPrompt = prompt.replace(/^@\w+\s*/, "");
    return { role, cleanPrompt };
  }
  return { role: null, cleanPrompt: prompt };
}

/**
 * Find the best matching agent for a role, with fallbacks
 */
async function findAgentForRole(
  db: Db,
  companyId: string,
  role: string,
  excludeAgentId?: string,
): Promise<{ id: string; name: string; role: string } | null> {
  // Try exact role match
  const exactMatches = await db
    .select()
    .from(agentsTable)
    .where(
      and(
        eq(agentsTable.companyId, companyId),
        eq(agentsTable.role, role),
      ),
    );

  let candidates = exactMatches;
  if (excludeAgentId) {
    candidates = candidates.filter((a) => a.id !== excludeAgentId);
  }

  if (candidates.length > 0) {
    // Pick first active agent (could add round-robin here)
    return { id: candidates[0].id, name: candidates[0].name, role: candidates[0].role };
  }

  // Try fallback roles
  const fallbacks = ROLE_FALLBACKS[role] || [];
  for (const fallbackRole of fallbacks) {
    const fallbackMatches = await db
      .select()
      .from(agentsTable)
      .where(
        and(
          eq(agentsTable.companyId, companyId),
          eq(agentsTable.role, fallbackRole),
        ),
      );

    candidates = excludeAgentId ? fallbackMatches.filter((a) => a.id !== excludeAgentId) : fallbackMatches;

    if (candidates.length > 0) {
      return { id: candidates[0].id, name: candidates[0].name, role: candidates[0].role };
    }
  }

  return null;
}

/**
 * Route a task to the best agent
 */
export async function routeTask(
  db: Db,
  companyId: string,
  prompt: string,
  classification: ClassificationResult,
  config: Partial<RouterConfig> = {},
  overrides?: { provider?: string | null; model?: string | null },
): Promise<RouteResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Check for manual override
  const { role: overrideRole, cleanPrompt } = detectOverride(prompt);

  // Determine selected model: explicit override > complexity-based
  let selectedModel: string | null = null;
  let provider: string | null = null;

  if (overrides?.model) {
    selectedModel = overrides.model;
    provider = overrides.provider ?? getModelProvider(overrides.model).provider;
    console.log(`[RouteTask] Explicit model override: model=${selectedModel} provider=${provider}`);
  } else {
    selectedModel = await selectModelForComplexity(classification.complexity);
    provider = getModelProvider(selectedModel).provider;
  }

  if (overrideRole) {
    const overrideAgent = await findAgentForRole(db, companyId, overrideRole);
    return {
      agentId: overrideAgent?.id ?? null,
      agentName: overrideAgent?.name ?? null,
      agentRole: overrideRole,
      complexity: classification.complexity,
      confidence: 1.0,
      reason: `Manual override: @${overrideRole}`,
      wasOverridden: true,
      selectedModel,
      provider,
    };
  }

  // Use classified role
  const targetRole = classification.agentRole;
  const agent = await findAgentForRole(db, companyId, targetRole);

  if (agent) {
    return {
      agentId: agent.id,
      agentName: agent.name,
      agentRole: agent.role,
      complexity: classification.complexity,
      confidence: classification.confidence,
      reason: classification.reason,
      wasOverridden: false,
      selectedModel,
      provider,
    };
  }

  // Final fallback: default role
  const defaultAgent = await findAgentForRole(db, companyId, cfg.defaultRole);
  return {
    agentId: defaultAgent?.id ?? null,
    agentName: defaultAgent?.name ?? null,
    agentRole: cfg.defaultRole,
    complexity: classification.complexity,
    confidence: 0.1,
    reason: `No agent found for ${targetRole}, falling back to ${cfg.defaultRole}`,
    wasOverridden: false,
    selectedModel,
    provider,
  };
}

/**
 * Get model configuration hint based on complexity
 */
export function getModelConfigForComplexity(complexity: Complexity) {
  return COMPLEXITY_MODEL_HINTS[complexity] || COMPLEXITY_MODEL_HINTS.medium;
}

/**
 * Calculate estimated cost savings from routing
 */
export function calculateRoutingSavings(
  classification: ClassificationResult,
  actualAgentRole: string,
): { estimatedSavingsPercent: number; reasoning: string } {
  // Simple tasks routed to cheaper/faster agents = savings
  if (classification.complexity === "simple" && actualAgentRole !== "ceo") {
    return {
      estimatedSavingsPercent: 25,
      reasoning: "Simple task routed to specialist instead of CEO",
    };
  }

  if (classification.complexity === "complex" && actualAgentRole === "ceo") {
    return {
      estimatedSavingsPercent: 0,
      reasoning: "Complex task correctly routed to CEO",
    };
  }

  return {
    estimatedSavingsPercent: 10,
    reasoning: "Standard routing applied",
  };
}
