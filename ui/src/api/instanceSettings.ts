import type {
  InstanceExperimentalSettings,
  InstanceGeneralSettings,
  PatchInstanceGeneralSettings,
  PatchInstanceExperimentalSettings,
} from "@paperclipai/shared";
import { api } from "./client";

export interface LatencyOptimizationConfig {
  enabled: boolean;
  latencyThresholdMs: number;
  maxLatencyHistory: number;
  latencyWeight: number;
  costWeight: number;
}

export interface ModelRouterConfig {
  complexityModels: {
    simple: string;
    medium: string;
    complex: string;
  };
  tokenEstimates: Record<string, { input: number; output: number }>;
  latencyOptimization: LatencyOptimizationConfig;
}

export const instanceSettingsApi = {
  getGeneral: () =>
    api.get<InstanceGeneralSettings>("/instance/settings/general"),
  updateGeneral: (patch: PatchInstanceGeneralSettings) =>
    api.patch<InstanceGeneralSettings>("/instance/settings/general", patch),
  getExperimental: () =>
    api.get<InstanceExperimentalSettings>("/instance/settings/experimental"),
  updateExperimental: (patch: PatchInstanceExperimentalSettings) =>
    api.patch<InstanceExperimentalSettings>("/instance/settings/experimental", patch),
  getModelRouter: () =>
    api.get<ModelRouterConfig>("/instance/settings/model-router"),
  updateModelRouter: (patch: { complexityModels?: ModelRouterConfig["complexityModels"]; latencyOptimization?: Partial<LatencyOptimizationConfig> }) =>
    api.patch<ModelRouterConfig>("/instance/settings/model-router", patch),
};
