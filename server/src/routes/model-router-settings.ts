import { Router, type Request } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { forbidden } from "../errors.js";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";
import { getPromptCacheStats, MODEL_PRICING, getPerformanceStats, isRateLimited, getRateLimitCooldownMs } from "../ai/router.js";

function assertCanManageInstanceSettings(req: Request) {
  if (req.actor.type !== "board") {
    throw forbidden("Board access required");
  }
  if (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin) {
    return;
  }
  throw forbidden("Instance admin access required");
}

interface ModelRouterConfig {
  tokenEstimates?: Record<string, { input: number; output: number }>;
  complexityModels?: Record<string, string>;
  latencyOptimization?: {
    enabled: boolean;
    latencyThresholdMs: number;
    maxLatencyHistory: number;
    latencyWeight: number;
    costWeight: number;
  };
  [key: string]: unknown;
}

const DEFAULT_CONFIG: ModelRouterConfig = {
  tokenEstimates: {
    low: { input: 5000, output: 2000 },
    medium: { input: 20000, output: 8000 },
    high: { input: 50000, output: 25000 },
  },
  complexityModels: {
    simple: "kimi-k1",
    medium: "kimi-k1.5",
    complex: "kimi-k2.5",
  },
};

async function readConfig(): Promise<ModelRouterConfig> {
  try {
    const configPath = path.join(resolvePaperclipInstanceRoot(), "model-router-config.json");
    const raw = await fs.readFile(configPath, "utf-8");
    return JSON.parse(raw) as ModelRouterConfig;
  } catch {
    return DEFAULT_CONFIG;
  }
}

async function writeConfig(config: ModelRouterConfig): Promise<void> {
  const configPath = path.join(resolvePaperclipInstanceRoot(), "model-router-config.json");
  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function modelRouterSettingsRoutes() {
  const router = Router();

  router.get("/instance/settings/model-router", async (req, res) => {
    if (req.actor.type !== "board") {
      throw forbidden("Board access required");
    }
    const config = await readConfig();
    res.json({
      complexityModels: config.complexityModels ?? DEFAULT_CONFIG.complexityModels,
      tokenEstimates: config.tokenEstimates ?? DEFAULT_CONFIG.tokenEstimates,
      latencyOptimization: config.latencyOptimization ?? {
        enabled: true,
        latencyThresholdMs: 5000,
        maxLatencyHistory: 50,
        latencyWeight: 0.3,
        costWeight: 0.7,
      },
    });
  });

  router.patch("/instance/settings/model-router", async (req, res) => {
    assertCanManageInstanceSettings(req);

    const body = req.body as {
      complexityModels?: Record<string, string>;
      latencyOptimization?: Record<string, unknown>;
    };

    const config = await readConfig();

    if (body.complexityModels && typeof body.complexityModels === "object") {
      // Validate required keys
      const requiredKeys = ["simple", "medium", "complex"];
      for (const key of requiredKeys) {
        if (typeof body.complexityModels[key] !== "string" || !body.complexityModels[key].trim()) {
          return res.status(400).json({ error: `complexityModels.${key} must be a non-empty string` });
        }
      }
      config.complexityModels = {
        simple: body.complexityModels.simple.trim(),
        medium: body.complexityModels.medium.trim(),
        complex: body.complexityModels.complex.trim(),
      };
    }

    if (body.latencyOptimization && typeof body.latencyOptimization === "object") {
      const lo = body.latencyOptimization;
      config.latencyOptimization = {
        enabled: typeof lo.enabled === "boolean" ? lo.enabled : (config.latencyOptimization?.enabled ?? true),
        latencyThresholdMs: typeof lo.latencyThresholdMs === "number" ? lo.latencyThresholdMs : (config.latencyOptimization?.latencyThresholdMs ?? 5000),
        maxLatencyHistory: typeof lo.maxLatencyHistory === "number" ? lo.maxLatencyHistory : (config.latencyOptimization?.maxLatencyHistory ?? 50),
        latencyWeight: typeof lo.latencyWeight === "number" ? lo.latencyWeight : (config.latencyOptimization?.latencyWeight ?? 0.3),
        costWeight: typeof lo.costWeight === "number" ? lo.costWeight : (config.latencyOptimization?.costWeight ?? 0.7),
      };
    }

    await writeConfig(config);

    res.json({
      complexityModels: config.complexityModels ?? DEFAULT_CONFIG.complexityModels,
      tokenEstimates: config.tokenEstimates ?? DEFAULT_CONFIG.tokenEstimates,
      latencyOptimization: config.latencyOptimization ?? {
        enabled: true,
        latencyThresholdMs: 5000,
        maxLatencyHistory: 50,
        latencyWeight: 0.3,
        costWeight: 0.7,
      },
    });
  });

  router.get("/instance/settings/model-router/cache-stats", async (req, res) => {
    if (req.actor.type !== "board") {
      throw forbidden("Board access required");
    }
    const stats = getPromptCacheStats();
    res.json(stats);
  });

  router.get("/instance/settings/model-router/performance", async (req, res) => {
    if (req.actor.type !== "board") {
      throw forbidden("Board access required");
    }
    const models = Object.keys(MODEL_PRICING).filter((m) => m !== "default");
    const stats = models.map((model) => ({
      model,
      ...getPerformanceStats(model),
      rateLimited: isRateLimited(model),
      rateLimitCooldownMs: getRateLimitCooldownMs(model),
    }));
    res.json(stats);
  });

  return router;
}
