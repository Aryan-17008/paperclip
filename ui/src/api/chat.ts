import { api } from "./client";

export interface ChatRouteRequest {
  prompt: string;
  companyId: string;
  attachments?: string[];
  provider?: string;
  model?: string;
}

export interface ChatRouteResponse {
  success: boolean;
  classification: {
    role: string;
    roleLabel: string;
    complexity: string;
    confidence: number;
    reason: string;
    wasOverridden: boolean;
  };
  agent: {
    id: string;
    name: string;
    role: string;
  } | null;
  issue: {
    id: string;
    identifier: string;
    title: string;
    url: string;
  };
  routing: {
    estimatedSavingsPercent: number;
    modelHint: string;
    cacheHit: boolean;
    cacheSimilarityScore: number;
    estimatedLatencyMs: number | null;
    sessionLocked: boolean;
    selectedModel: string | null;
    provider: string;
    apiKeyName: string;
    providerColor: string;
  };
}

export interface ChatAgent {
  id: string;
  name: string;
  role: string;
  roleLabel: string;
  status: string;
  icon: string | null;
  avatarUrl?: string | null;
}

export interface ChatAgentsResponse {
  agents: ChatAgent[];
}

export interface UpdateRoutingModelRequest {
  issueId: string;
  model: string;
}

export interface UpdateRoutingModelResponse {
  success: boolean;
  model: string;
  provider: string;
  apiKeyName: string;
  providerColor: string;
}

export interface ChatMessage {
  id: string;
  type: "user" | "bot";
  content: string;
  timestamp: string;
  attachments?: ChatAttachment[];
  routing?: {
    role: string;
    roleLabel: string;
    complexity: string;
    confidence: number;
    reason: string;
    wasOverridden: boolean;
    agentName: string | null;
    issueIdentifier: string;
    issueUrl: string;
    estimatedSavingsPercent: number;
    modelHint: string;
    provider?: string;
    apiKeyName?: string;
    providerColor?: string;
    selectedModel?: string | null;
    cacheHit?: boolean;
    estimatedLatencyMs?: number | null;
  };
  taskProgress?: {
    issueId: string;
    identifier: string;
    status: string;
    assigneeName: string | null;
    updatedAt: string;
  };
}

export interface ChatAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export const chatApi = {
  route: (data: ChatRouteRequest) =>
    api.post<ChatRouteResponse>("/chat/route", data),
  listAgents: (companyId: string) =>
    api.get<ChatAgentsResponse>(`/chat/agents/${encodeURIComponent(companyId)}`),
  uploadAttachment: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.postForm<ChatAttachment>("/chat/attachments", form);
  },
  getIssueProgress: (issueId: string) =>
    api.get<{
      id: string;
      identifier: string;
      status: string;
      assigneeAgentId: string | null;
      assigneeUserId: string | null;
      assigneeName: string | null;
      updatedAt: string;
    }>(`/issues/${issueId}/progress`),
  getRoutingStats: (companyId: string) =>
    api.get<{
      totalDecisions: number;
      thisWeek: { count: number; avgSavingsPercent: number; costCents: number };
      complexityBreakdown: { simple: number; medium: number; complex: number };
      avgSavingsPercent: number;
      totalEstimatedSavingsPercent: number;
      overrideCount: number;
      overridePercent: number;
      topAgents: Array<{ name: string; count: number }>;
      costTracking: {
        totalCostCents: number;
        avgCostPerTaskCents: number;
        trackedTasks: number;
      };
      latencyTracking: {
        avgLatencyMs: number;
        avgEstimatedLatencyMs: number;
        trackedTasks: number;
      };
      cacheTracking: {
        cacheHits: number;
        cacheHitRate: number;
        avgSimilarityScore: number;
      };
    }>(`/chat/routing-stats/${encodeURIComponent(companyId)}`),
  getCostTrends: (companyId: string, days?: number) =>
    api.get<{
      days: number;
      daily: Array<{
        date: string;
        tasks: number;
        costCents: number;
        avgSavingsPercent: number;
      }>;
      summary: {
        totalTasks: number;
        totalCostCents: number;
        avgSavingsPercent: number;
      };
    }>(`/chat/cost-trends/${encodeURIComponent(companyId)}?days=${days ?? 14}`),
  updateRoutingModel: (issueId: string, model: string) =>
    api.patch<UpdateRoutingModelResponse>(`/chat/routing/${encodeURIComponent(issueId)}/model`, { model }),
};
