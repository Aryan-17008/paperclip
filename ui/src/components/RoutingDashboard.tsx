import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingDown, GitBranch, Target, Zap, BarChart3, Users, DollarSign, Activity, Calendar, Clock, Database } from "lucide-react";
import { Link } from "@/lib/router";
import { chatApi } from "@/api/chat";
import { useCompany } from "@/context/CompanyContext";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";

const complexityColors = {
  simple: "bg-green-500/20 text-green-600",
  medium: "bg-yellow-500/20 text-yellow-600",
  complex: "bg-red-500/20 text-red-600",
};

function formatCents(cents: number): string {
  if (cents === 0) return "$0.00";
  if (cents < 100) return `¢${cents}`;
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function RoutingDashboard() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const companyId = selectedCompanyId;
  const [trendDays, setTrendDays] = useState(14);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: queryKeys.chat.routingStats(companyId ?? ""),
    queryFn: () => chatApi.getRoutingStats(companyId!),
    enabled: Boolean(companyId),
  });

  const { data: trends, isLoading: trendsLoading } = useQuery({
    queryKey: queryKeys.chat.costTrends(companyId ?? "", trendDays),
    queryFn: () => chatApi.getCostTrends(companyId!, trendDays),
    enabled: Boolean(companyId),
  });

  const isLoading = statsLoading || trendsLoading;

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="h-4 w-32 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!stats || stats.totalDecisions === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No routing data yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Send messages in chat to see routing stats
        </p>
      </div>
    );
  }

  const totalTasks = stats.totalDecisions;
  const weekTasks = stats.thisWeek.count;
  const avgSavings = stats.avgSavingsPercent;
  const weekSavings = stats.thisWeek.avgSavingsPercent;
  const costTracking = stats.costTracking;

  // Calculate max for bar chart scaling
  const maxCost = trends?.daily.reduce((m, d) => Math.max(m, d.costCents), 0) ?? 0;
  const maxTasks = trends?.daily.reduce((m, d) => Math.max(m, d.tasks), 0) ?? 0;

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Model Router Stats</h3>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/instance/settings/model-router"
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
          >
            Configure
          </Link>
          <span className="text-xs text-muted-foreground">
            {totalTasks} total decisions
          </span>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Savings Card */}
        <div className="rounded-lg bg-gradient-to-br from-emerald-500/10 to-green-500/5 border border-emerald-500/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="h-4 w-4 text-emerald-600" />
            <span className="text-xs font-medium text-emerald-700">Avg Savings</span>
          </div>
          <p className="text-2xl font-bold text-emerald-700">{avgSavings}%</p>
          <p className="text-xs text-emerald-600/70 mt-1">
            {weekSavings}% this week ({weekTasks} tasks)
          </p>
        </div>

        {/* Cost Card */}
        <div className="rounded-lg bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-amber-600" />
            <span className="text-xs font-medium text-amber-700">Total Cost</span>
          </div>
          <p className="text-2xl font-bold text-amber-700">{formatCents(costTracking.totalCostCents)}</p>
          <p className="text-xs text-amber-600/70 mt-1">
            {formatCents(costTracking.avgCostPerTaskCents)} avg/task · {costTracking.trackedTasks} tracked
          </p>
        </div>

        {/* Latency Card */}
        {stats.latencyTracking && stats.latencyTracking.trackedTasks > 0 && (
          <div className="rounded-lg bg-gradient-to-br from-cyan-500/10 to-sky-500/5 border border-cyan-500/20 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-cyan-600" />
              <span className="text-xs font-medium text-cyan-700">Avg Latency</span>
            </div>
            <p className="text-2xl font-bold text-cyan-700">{stats.latencyTracking.avgLatencyMs}ms</p>
            <p className="text-xs text-cyan-600/70 mt-1">
              est {stats.latencyTracking.avgEstimatedLatencyMs}ms · {stats.latencyTracking.trackedTasks} measured
            </p>
          </div>
        )}

        {/* Cache Card */}
        {stats.cacheTracking && stats.totalDecisions > 0 && (
          <div className="rounded-lg bg-gradient-to-br from-violet-500/10 to-violet-500/5 border border-violet-500/20 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Database className="h-4 w-4 text-violet-600" />
              <span className="text-xs font-medium text-violet-700">Cache Hits</span>
            </div>
            <p className="text-2xl font-bold text-violet-700">{stats.cacheTracking.cacheHitRate}%</p>
            <p className="text-xs text-violet-600/70 mt-1">
              {stats.cacheTracking.cacheHits} hits · {stats.cacheTracking.avgSimilarityScore}% sim
            </p>
          </div>
        )}

        {/* Override Card */}
        <div className="rounded-lg bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-blue-500/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-medium text-blue-700">Manual Overrides</span>
          </div>
          <p className="text-2xl font-bold text-blue-700">{stats.overrideCount}</p>
          <p className="text-xs text-blue-600/70 mt-1">
            {stats.overridePercent}% of all decisions
          </p>
        </div>

        {/* This Week Card */}
        <div className="rounded-lg bg-gradient-to-br from-purple-500/10 to-purple-500/5 border border-purple-500/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-4 w-4 text-purple-600" />
            <span className="text-xs font-medium text-purple-700">This Week</span>
          </div>
          <p className="text-2xl font-bold text-purple-700">{formatCents(stats.thisWeek.costCents)}</p>
          <p className="text-xs text-purple-600/70 mt-1">
            {weekTasks} tasks · {stats.thisWeek.avgLatencyMs}ms avg
          </p>
        </div>
      </div>

      {/* Cost Trends Chart */}
      {trends && trends.daily.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Cost Trends</span>
            </div>
            <div className="flex gap-1">
              {[7, 14, 30].map((d) => (
                <Button
                  key={d}
                  variant={trendDays === d ? "default" : "ghost"}
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() => setTrendDays(d)}
                >
                  {d}d
                </Button>
              ))}
            </div>
          </div>

          {/* Bar Chart */}
          <div className="space-y-2">
            {trends.daily.map((day) => {
              const costHeight = maxCost > 0 ? Math.max((day.costCents / maxCost) * 100, 4) : 4;
              const taskHeight = maxTasks > 0 ? Math.max((day.tasks / maxTasks) * 100, 4) : 4;
              return (
                <div key={day.date} className="flex items-end gap-2">
                  <span className="text-xs text-muted-foreground w-10 shrink-0">
                    {formatDate(day.date)}
                  </span>
                  <div className="flex-1 flex items-end gap-1 h-16">
                    {/* Cost bar */}
                    <div
                      className="w-full bg-amber-500/30 rounded-t transition-all hover:bg-amber-500/50 relative group"
                      style={{ height: `${costHeight}%`, minHeight: 4 }}
                    >
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-popover text-popover-foreground text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                        {formatCents(day.costCents)} · {day.tasks} tasks
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground w-8 text-right">
                    {day.tasks}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-amber-500/30 rounded" />
              <span>Cost</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-primary/30 rounded" />
              <span>Tasks (right axis)</span>
            </div>
          </div>
        </div>
      )}

      {/* Complexity Breakdown */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Complexity Breakdown</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {(["simple", "medium", "complex"] as const).map((level) => {
            const count = stats.complexityBreakdown[level];
            const percent = totalTasks > 0 ? Math.round((count / totalTasks) * 100) : 0;
            return (
              <div
                key={level}
                className={cn(
                  "rounded-lg p-3 text-center",
                  complexityColors[level]
                )}
              >
                <p className="text-lg font-bold">{count}</p>
                <p className="text-xs capitalize">{level}</p>
                <p className="text-xs opacity-70">{percent}%</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top Agents */}
      {stats.topAgents.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Top Routed Agents</span>
          </div>
          <div className="space-y-2">
            {stats.topAgents.map((agent, i) => (
              <div
                key={agent.name}
                className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground w-4">
                    {i + 1}
                  </span>
                  <span className="text-sm">{agent.name}</span>
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  {agent.count} tasks
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
