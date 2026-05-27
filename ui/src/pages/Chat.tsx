import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCompany } from "@/context/CompanyContext";
import { chatApi } from "@/api/chat";
import {
  Send,
  Bot,
  User,
  CheckCircle2,
  Loader2,
  Wand2,
  Bug,
  Code2,
  Palette,
  Shield,
  TrendingUp,
  Lightbulb,
  MessageSquare,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/lib/queryKeys";

interface ChatMessage {
  id: string;
  type: "user" | "bot";
  content: string;
  timestamp: Date;
  routing?: {
    role: string;
    roleLabel: string;
    confidence: number;
    agentName: string | null;
    issueIdentifier: string;
    issueUrl: string;
  };
}

const QUICK_ACTIONS = [
  { label: "Write a blog post", icon: MessageSquare, role: "cmo" },
  { label: "Fix a bug", icon: Bug, role: "engineer" },
  { label: "Build a UI component", icon: Palette, role: "frontend_engineer" },
  { label: "Design an API", icon: Code2, role: "backend_engineer" },
  { label: "Security audit", icon: Shield, role: "security" },
  { label: "Create roadmap", icon: TrendingUp, role: "ceo" },
];

function getRoleIcon(role: string) {
  switch (role) {
    case "cmo": return MessageSquare;
    case "engineer": return Code2;
    case "frontend_engineer": return Palette;
    case "backend_engineer": return Code2;
    case "security": return Shield;
    case "ceo": return TrendingUp;
    case "qa": return Bug;
    case "qa_tester": return Bug;
    case "designer": return Palette;
    case "pm": return Lightbulb;
    case "devops": return RefreshCw;
    default: return Wand2;
  }
}

export function Chat() {
  const { selectedCompanyId } = useCompany();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: agentsData } = useQuery({
    queryKey: queryKeys.chat.agents(selectedCompanyId!),
    queryFn: () => chatApi.listAgents(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const routeMutation = useMutation({
    mutationFn: (prompt: string) =>
      chatApi.route({ prompt, companyId: selectedCompanyId! }),
    onSuccess: (data) => {
      const botMessage: ChatMessage = {
        id: crypto.randomUUID(),
        type: "bot",
        content: `Routed to **${data.classification.roleLabel}** (${Math.round(data.classification.confidence * 100)}% confidence)`,
        timestamp: new Date(),
        routing: {
          role: data.classification.role,
          roleLabel: data.classification.roleLabel,
          confidence: data.classification.confidence,
          agentName: data.agent?.name ?? null,
          issueIdentifier: data.issue.identifier,
          issueUrl: data.issue.url,
        },
      };
      setMessages((prev) => [...prev, botMessage]);
    },
    onError: (error) => {
      const botMessage: ChatMessage = {
        id: crypto.randomUUID(),
        type: "bot",
        content: `Sorry, I couldn't route that task. Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, botMessage]);
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || !selectedCompanyId) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      type: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    routeMutation.mutate(input.trim());
    setInput("");
  };

  const handleQuickAction = (action: string) => {
    setInput(action);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!selectedCompanyId) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="p-6 text-center">
          <Bot className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold">Select a Company</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose a company from the sidebar to start chatting with your AI agents.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">AI Task Router</h1>
            <p className="text-sm text-muted-foreground">
              Describe a task and I'll route it to the right agent
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-6 py-4" ref={scrollRef}>
        <div className="mx-auto max-w-3xl space-y-4">
          {messages.length === 0 && (
            <div className="space-y-6 py-8">
              {/* Welcome */}
              <div className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                  <Wand2 className="h-8 w-8 text-primary" />
                </div>
                <h2 className="mt-4 text-xl font-semibold">What would you like to work on?</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Describe your task in natural language and I'll find the best agent for the job.
                </p>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {QUICK_ACTIONS.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.label}
                      onClick={() => handleQuickAction(action.label)}
                      className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent/50"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="text-sm">{action.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Agent Cards */}
              {agentsData && agentsData.agents.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground">Your Team</h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {agentsData.agents.map((agent) => {
                      const Icon = getRoleIcon(agent.role);
                      return (
                        <Card
                          key={agent.id}
                          className={cn(
                            "flex items-center gap-3 p-3",
                            agent.status === "active" ? "opacity-100" : "opacity-60"
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{agent.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{agent.roleLabel}</p>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex gap-3",
                message.type === "user" ? "justify-end" : "justify-start"
              )}
            >
              {message.type === "bot" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-2.5",
                  message.type === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                {message.routing && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-medium">
                        Issue created: {message.routing.issueIdentifier}
                      </span>
                    </div>
                    {message.routing.agentName && (
                      <p className="text-xs text-muted-foreground">
                        Assigned to: {message.routing.agentName}
                      </p>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => navigate(message.routing!.issueUrl)}
                    >
                      <ExternalLink className="mr-2 h-3 w-3" />
                      View Issue
                    </Button>
                  </div>
                )}
                <p className="mt-1 text-right text-xs opacity-60">
                  {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              {message.type === "user" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary">
                  <User className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
            </div>
          ))}

          {routeMutation.isPending && (
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-2.5">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Routing your task...</span>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-border px-6 py-4">
        <div className="mx-auto flex max-w-3xl gap-2">
          <Input
            placeholder="Describe your task... (e.g., 'Write a blog post about AI')"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1"
            disabled={routeMutation.isPending}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || routeMutation.isPending}
          >
            <Send className="mr-2 h-4 w-4" />
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
