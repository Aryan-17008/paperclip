import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GitBranch, Clock, DollarSign, Zap, Hash, Key, Server, AlertTriangle } from "lucide-react";
import { useParams } from "react-router-dom";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { queryKeys } from "../lib/queryKeys";

interface RoutingDecision {
  id: string;
  issueId: string;
  complexity: string;
  classifiedRole: string;
  confidence: number;
  routedAgentRole: string;
  wasOverridden: boolean;
  model: string | null;
  provider: string;
  apiKey: string;
  costEstimateCents: number;
  costSource: string | null;
  latencyMs: number | null;
  estimatedLatencyMs: number | null;
  promptHash: string | null;
  cacheHit: boolean | null;
  cacheSimilarityScore: number | null;
  failoverModel: string | null;
  failoverReason: string | null;
  createdAt: string;
}

const providerColors: Record<string, string> = {
  Kimi: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  OpenAI: "bg-green-500/10 text-green-600 border-green-500/20",
  Google: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  Groq: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  Anthropic: "bg-red-500/10 text-red-600 border-red-500/20",
  unknown: "bg-gray-500/10 text-gray-600 border-gray-500/20",
};

const complexityColors: Record<string, string> = {
  simple: "bg-green-500/10 text-green-600 border-green-500/20",
  medium: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  complex: "bg-red-500/10 text-red-600 border-red-500/20",
};

export function ModelRouterDashboard() {
  const { companyId } = useParams<{ companyId: string }>();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [filter, setFilter] = useState<string>("all");

  useState(() => {
    setBreadcrumbs([
      { label: "Model Router" },
      { label: "Dashboard" },
    ]);
  });

  const decisionsQuery = useQuery({
    queryKey: ["routing-decisions", companyId],
    queryFn: async () => {
      const res = await fetch(`/api/chat/routing-decisions/${companyId}?limit=50`);
      if (!res.ok) throw new Error("Failed to fetch routing decisions");
      return res.json() as Promise<{ decisions: RoutingDecision[]; total: number }>;
    },
    enabled: !!companyId,
  });

  const decisions = decisionsQuery.data?.decisions ?? [];

  const filteredDecisions = filter === "all" 
    ? decisions 
    : decisions.filter(d => d.provider === filter);

  const stats = {
    total: decisions.length,
    cacheHits: decisions.filter(d => d.cacheHit).length,
    avgLatency: decisions.filter(d => d.latencyMs).length > 0
      ? Math.round(decisions.filter(d => d.latencyMs).reduce((s, d) => s + (d.latencyMs || 0), 0) / decisions.filter(d => d.latencyMs).length)
      : 0,
    totalCost: decisions.reduce((s, d) => s + (d.costEstimateCents || 0), 0),
    providers: [...new Set(decisions.map(d => d.provider))],
  };

  if (decisionsQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">Loading routing decisions...</div>;
  }

  if (decisionsQuery.error) {
    return (
      <div className="text-sm text-destructive">
        {decisionsQuery.error instanceof Error
          ? decisionsQuery.error.message
          : "Failed to load routing decisions"}
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Model Router Dashboard</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          View routing decisions, model usage, latency, and API key consumption.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Decisions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cache Hits</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.cacheHits}</div>
            <div className="text-xs text-muted-foreground">
              {stats.total > 0 ? Math.round((stats.cacheHits / stats.total) * 100) : 0}% hit rate
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Latency</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgLatency}ms</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(stats.totalCost / 100).toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Provider Filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Filter by provider:</span>
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1 rounded-md text-sm ${filter === "all" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
        >
          All
        </button>
        {stats.providers.map(provider => (
          <button
            key={provider}
            onClick={() => setFilter(provider)}
            className={`px-3 py-1 rounded-md text-sm ${filter === provider ? "bg-primary text-primary-foreground" : "bg-muted"}`}
          >
            {provider}
          </button>
        ))}
      </div>

      {/* Routing Decisions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent Routing Decisions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">Issue</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">Complexity</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">Model</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">Provider</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">API Key</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">Cost</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">Latency</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">Cache</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {filteredDecisions.map((decision) => (
                  <tr key={decision.id} className="border-b border-border/50 hover:bg-muted/50">
                    <td className="py-2 px-3">
                      <a href={`/issues/${decision.issueId}`} className="text-primary hover:underline">
                        {decision.issueId.slice(0, 8)}...
                      </a>
                    </td>
                    <td className="py-2 px-3">
                      <Badge variant="outline" className={complexityColors[decision.complexity] || complexityColors.unknown}>
                        {decision.complexity}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 font-mono text-xs">{decision.model ?? "-"}</td>
                    <td className="py-2 px-3">
                      <Badge variant="outline" className={providerColors[decision.provider] || providerColors.unknown}>
                        {decision.provider}
                      </Badge>
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1">
                        <Key className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs">{decision.apiKey}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs">${(decision.costEstimateCents / 100).toFixed(2)}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs">{decision.latencyMs ? `${decision.latencyMs}ms` : "-"}</span>
                        {decision.estimatedLatencyMs && (
                          <span className="text-xs text-muted-foreground">(est: {decision.estimatedLatencyMs}ms)</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      {decision.cacheHit ? (
                        <div className="flex items-center gap-1 text-green-600">
                          <Zap className="h-3 w-3" />
                          <span className="text-xs">Hit</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">
                      {new Date(decision.createdAt).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Provider Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Provider Usage Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats.providers.map(provider => {
              const providerDecisions = decisions.filter(d => d.provider === provider);
              const providerCost = providerDecisions.reduce((s, d) => s + (d.costEstimateCents || 0), 0);
              const providerLatency = providerDecisions.filter(d => d.latencyMs).length > 0
                ? Math.round(providerDecisions.filter(d => d.latencyMs).reduce((s, d) => s + (d.latencyMs || 0), 0) / providerDecisions.filter(d => d.latencyMs).length)
                : 0;
              
              return (
                <div key={provider} className="rounded-lg border border-border p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Server className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{provider}</span>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tasks:</span>
                      <span>{providerDecisions.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Cost:</span>
                      <span>${(providerCost / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Avg Latency:</span>
                      <span>{providerLatency}ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">API Key:</span>
                      <span className="font-mono text-xs">{providerDecisions[0]?.apiKey ?? "-"}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}