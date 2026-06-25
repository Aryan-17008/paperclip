import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitBranch, Save, RotateCcw, Zap } from "lucide-react";
import { instanceSettingsApi } from "../api/instanceSettings";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { LatencyOptimizationConfig } from "../api/instanceSettings";

const complexityMeta = {
  simple: {
    label: "Simple",
    description: "Trivial tasks, quick fixes, one-liners",
    color: "bg-green-500/10 text-green-600 border-green-500/20",
    defaultModel: "kimi-k1",
  },
  medium: {
    label: "Medium",
    description: "Standard dev tasks, features, debugging",
    color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    defaultModel: "kimi-k1.5",
  },
  complex: {
    label: "Complex",
    description: "Hard bugs, architecture, deep reasoning",
    color: "bg-red-500/10 text-red-600 border-red-500/20",
    defaultModel: "kimi-k2.5",
  },
};

const availableModels = [
  "kimi-k1",
  "kimi-k1.5",
  "kimi-k2.5",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4",
  "gpt-3.5-turbo",
  "claude-sonnet-4",
  "claude-opus-4",
  "claude-haiku",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
];

const defaultLatencyConfig: LatencyOptimizationConfig = {
  enabled: true,
  latencyThresholdMs: 5000,
  maxLatencyHistory: 50,
  latencyWeight: 0.3,
  costWeight: 0.7,
};

export function ModelRouterSettings() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [localModels, setLocalModels] = useState<Record<string, string>>({});
  const [localLatency, setLocalLatency] = useState<LatencyOptimizationConfig>(defaultLatencyConfig);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: "Instance Settings" },
      { label: "Model Router" },
    ]);
  }, [setBreadcrumbs]);

  const configQuery = useQuery({
    queryKey: queryKeys.instance.modelRouterSettings,
    queryFn: () => instanceSettingsApi.getModelRouter(),
  });

  useEffect(() => {
    if (configQuery.data?.complexityModels) {
      setLocalModels(configQuery.data.complexityModels);
    }
    if (configQuery.data?.latencyOptimization) {
      setLocalLatency(configQuery.data.latencyOptimization);
    }
  }, [configQuery.data]);

  const updateMutation = useMutation({
    mutationFn: instanceSettingsApi.updateModelRouter,
    onSuccess: async () => {
      setActionError(null);
      setSuccessMessage("Model router config saved successfully");
      await queryClient.invalidateQueries({ queryKey: queryKeys.instance.modelRouterSettings });
      setTimeout(() => setSuccessMessage(null), 3000);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Failed to update model router config");
      setSuccessMessage(null);
    },
  });

  const hasModelChanges = configQuery.data
    ? Object.keys(localModels).some(
        (key) => localModels[key] !== configQuery.data!.complexityModels[key as keyof typeof configQuery.data.complexityModels]
      )
    : false;

  const hasLatencyChanges = configQuery.data
    ? JSON.stringify(localLatency) !== JSON.stringify(configQuery.data.latencyOptimization)
    : false;

  const hasChanges = hasModelChanges || hasLatencyChanges;

  if (configQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">Loading model router config...</div>;
  }

  if (configQuery.error) {
    return (
      <div className="text-sm text-destructive">
        {configQuery.error instanceof Error
          ? configQuery.error.message
          : "Failed to load model router config"}
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Model Router</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Configure which model is used for each task complexity level. The model router automatically selects the appropriate model based on how complex the task is.
        </p>
      </div>

      {actionError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {successMessage && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-600">
          {successMessage}
        </div>
      )}

      <div className="space-y-4">
        {(Object.keys(complexityMeta) as Array<keyof typeof complexityMeta>).map((key) => {
          const meta = complexityMeta[key];
          const currentModel = localModels[key] ?? meta.defaultModel;

          return (
            <Card key={key}>
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <Badge variant="outline" className={meta.color}>
                    {meta.label}
                  </Badge>
                  <div className="flex-1 space-y-3">
                    <div>
                      <p className="text-sm font-medium">{meta.description}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Default: {meta.defaultModel}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="text-sm text-muted-foreground shrink-0">Model:</label>
                      <select
                        value={currentModel}
                        onChange={(e) =>
                          setLocalModels((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        {availableModels.map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Latency Optimization Section */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <Zap className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium">Latency Optimization</h3>
                  <p className="text-xs text-muted-foreground">
                    Automatically pick the fastest model based on recent performance data
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="latency-toggle"
                    checked={localLatency.enabled}
                    onCheckedChange={(checked) =>
                      setLocalLatency((prev) => ({ ...prev, enabled: checked }))
                    }
                  />
                  <Label htmlFor="latency-toggle" className="text-sm">
                    {localLatency.enabled ? "On" : "Off"}
                  </Label>
                </div>
              </div>

              {localLatency.enabled && (
                <div className="space-y-4 pt-2 border-t border-border/50">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Cost vs Latency Balance</Label>
                      <span className="text-xs text-muted-foreground">
                        Cost: {Math.round(localLatency.costWeight * 100)}% / Latency: {Math.round(localLatency.latencyWeight * 100)}%
                      </span>
                    </div>
                    <Slider
                      value={[localLatency.latencyWeight]}
                      min={0}
                      max={1}
                      step={0.1}
                      onValueChange={([v]) =>
                        setLocalLatency((prev) => ({
                          ...prev,
                          latencyWeight: v,
                          costWeight: Math.round((1 - v) * 10) / 10,
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Higher latency weight = prefer faster models. Higher cost weight = prefer cheaper models.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm">Latency Threshold (ms)</Label>
                      <Input
                        type="number"
                        value={localLatency.latencyThresholdMs}
                        onChange={(e) =>
                          setLocalLatency((prev) => ({
                            ...prev,
                            latencyThresholdMs: parseInt(e.target.value) || 5000,
                          }))
                        }
                        min={1000}
                        max={30000}
                        step={1000}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Max History Samples</Label>
                      <Input
                        type="number"
                        value={localLatency.maxLatencyHistory}
                        onChange={(e) =>
                          setLocalLatency((prev) => ({
                            ...prev,
                            maxLatencyHistory: parseInt(e.target.value) || 50,
                          }))
                        }
                        min={10}
                        max={200}
                        step={10}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button
          onClick={() =>
            updateMutation.mutate({
              complexityModels: {
                simple: localModels.simple ?? complexityMeta.simple.defaultModel,
                medium: localModels.medium ?? complexityMeta.medium.defaultModel,
                complex: localModels.complex ?? complexityMeta.complex.defaultModel,
              },
              latencyOptimization: localLatency,
            })
          }
          disabled={!hasChanges || updateMutation.isPending}
        >
          <Save className="h-4 w-4 mr-1.5" />
          {updateMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            if (configQuery.data) {
              setLocalModels(configQuery.data.complexityModels);
              setLocalLatency(configQuery.data.latencyOptimization);
            }
          }}
          disabled={!hasChanges}
        >
          <RotateCcw className="h-4 w-4 mr-1.5" />
          Reset
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <h3 className="text-sm font-medium mb-2">How it works</h3>
        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
          <li>When a task is created, the model router classifies its complexity (simple, medium, complex)</li>
          <li>The model selected above is automatically used for that task</li>
          <li>Latency optimization records how long each model takes and can switch to faster alternatives</li>
          <li>This saves money by using cheaper models for simple tasks and faster models when latency matters</li>
          <li>Changes take effect immediately — no restart needed</li>
        </ul>
      </div>
    </div>
  );
}
