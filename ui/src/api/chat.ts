import { api } from "./client";

export interface ChatRouteRequest {
  prompt: string;
  companyId: string;
}

export interface ChatRouteResponse {
  success: boolean;
  classification: {
    role: string;
    roleLabel: string;
    confidence: number;
    reason: string;
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
}

export interface ChatAgent {
  id: string;
  name: string;
  role: string;
  roleLabel: string;
  status: string;
  icon: string | null;
}

export interface ChatAgentsResponse {
  agents: ChatAgent[];
}

export const chatApi = {
  route: (data: ChatRouteRequest) =>
    api.post<ChatRouteResponse>("/chat/route", data),
  listAgents: (companyId: string) =>
    api.get<ChatAgentsResponse>(`/chat/agents/${encodeURIComponent(companyId)}`),
};
