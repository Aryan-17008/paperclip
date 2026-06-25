import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCompany } from "@/context/CompanyContext";
import { useTheme } from "@/context/ThemeContext";
import { chatApi } from "@/api/chat";
import { useChatHistory } from "@/hooks/useChatHistory";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { ChatMessageItem } from "@/components/ChatMessage";
import { AgentAvatar } from "@/components/AgentAvatar";
import { ChatHistoryButton } from "@/components/ChatHistoryButton";
import { RoutingDashboard } from "@/components/RoutingDashboard";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Send,
  Bot,
  User,
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
  Mic,
  MicOff,
  Paperclip,
  Moon,
  Sun,
  Loader2,
  BarChart3,
  ChevronDown,
  Cpu,
  Zap,
  BrainCircuit,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/lib/queryKeys";

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
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<{ id: string; name: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>("auto");
  const [selectedModel, setSelectedModel] = useState<string>("auto");
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  const PROVIDERS = [
    { id: "auto", label: "Auto Route", icon: Zap, color: "text-amber-500" },
    { id: "kimi", label: "Kimi", icon: BrainCircuit, color: "text-emerald-500" },
    { id: "openai", label: "OpenAI", icon: Cpu, color: "text-blue-500" },
    { id: "anthropic", label: "Anthropic", icon: BrainCircuit, color: "text-orange-500" },
    { id: "gemini", label: "Gemini", icon: Zap, color: "text-purple-500" },
    { id: "groq", label: "Groq", icon: Cpu, color: "text-cyan-500" },
  ];

  const MODELS_BY_PROVIDER: Record<string, { id: string; label: string }[]> = {
    auto: [{ id: "auto", label: "Auto (Model Router decides)" }],
    kimi: [
      { id: "kimi-k1", label: "Kimi K1" },
      { id: "kimi-k1.5", label: "Kimi K1.5" },
      { id: "kimi-k2.5", label: "Kimi K2.5" },
    ],
    openai: [
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4o-mini", label: "GPT-4o Mini" },
      { id: "gpt-4", label: "GPT-4" },
      { id: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
    ],
    anthropic: [
      { id: "claude-sonnet-4", label: "Claude Sonnet 4" },
      { id: "claude-opus-4", label: "Claude Opus 4" },
      { id: "claude-haiku", label: "Claude Haiku" },
    ],
    gemini: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    ],
    groq: [
      { id: "groq-llama-3.3-70b", label: "Llama 3.3 70B" },
      { id: "groq-llama-3.1-8b", label: "Llama 3.1 8B" },
    ],
  };

  const {
    sessions,
    currentSession,
    currentSessionId,
    createSession,
    addMessage,
    loadSession,
    deleteSession,
  } = useChatHistory(selectedCompanyId);

  const {
    isListening,
    transcript,
    isSupported: speechSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition();

  const { data: agentsData } = useQuery({
    queryKey: queryKeys.chat.agents(selectedCompanyId!),
    queryFn: () => chatApi.listAgents(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000, // Real-time agent status updates
  });

  const routeMutation = useMutation({
    mutationFn: (data: { prompt: string; attachments?: string[]; provider?: string; model?: string }) =>
      chatApi.route({ prompt: data.prompt, companyId: selectedCompanyId!, attachments: data.attachments, provider: data.provider, model: data.model }),
    onSuccess: (data) => {
      const botMessage = {
        id: crypto.randomUUID(),
        type: "bot" as const,
        content: `Routed to **${data.classification.roleLabel}** (${Math.round(data.classification.confidence * 100)}% confidence)`,
        timestamp: new Date().toISOString(),
        routing: {
          role: data.classification.role,
          roleLabel: data.classification.roleLabel,
          complexity: data.classification.complexity,
          confidence: data.classification.confidence,
          reason: data.classification.reason,
          wasOverridden: data.classification.wasOverridden,
          agentName: data.agent?.name ?? null,
          issueIdentifier: data.issue.identifier,
          issueUrl: data.issue.url,
          estimatedSavingsPercent: data.routing.estimatedSavingsPercent,
          modelHint: data.routing.modelHint,
          provider: data.routing.provider,
          apiKeyName: data.routing.apiKeyName,
          providerColor: data.routing.providerColor,
          selectedModel: data.routing.selectedModel,
          cacheHit: data.routing.cacheHit,
          estimatedLatencyMs: data.routing.estimatedLatencyMs,
        },
      };
      addMessage(botMessage);

      // Poll for task progress
      if (data.issue.id) {
        pollTaskProgress(data.issue.id);
      }
    },
    onError: (error) => {
      const botMessage = {
        id: crypto.randomUUID(),
        type: "bot" as const,
        content: `Sorry, I couldn't route that task. Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: new Date().toISOString(),
      };
      addMessage(botMessage);
    },
  });

  // Poll task progress
  const pollTaskProgress = useCallback((issueId: string) => {
    const interval = setInterval(async () => {
      try {
        const progress = await chatApi.getIssueProgress(issueId);
        if (progress.status === "done" || progress.status === "cancelled") {
          clearInterval(interval);
        }
        // Update message with progress
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId) });
      } catch {
        clearInterval(interval);
      }
    }, 5000);

    // Stop polling after 5 minutes
    setTimeout(() => clearInterval(interval), 300_000);
  }, [queryClient]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [currentSession?.messages]);

  // Update input from speech transcript
  useEffect(() => {
    if (transcript) {
      setInput(transcript);
    }
  }, [transcript]);

  const handleSend = () => {
    if (!input.trim() || !selectedCompanyId) return;

    const userMessage = {
      id: crypto.randomUUID(),
      type: "user" as const,
      content: input,
      timestamp: new Date().toISOString(),
      attachments: attachments.length > 0 ? attachments.map(a => ({ id: a.id, name: a.name, type: "file" as const, size: 0, url: a.url })) : undefined,
    };

    addMessage(userMessage);
    setInput("");
    setAttachments([]);

    routeMutation.mutate({
      prompt: input,
      attachments: attachments.map(a => a.url),
      provider: selectedProvider === "auto" ? undefined : selectedProvider,
      model: selectedModel === "auto" ? undefined : selectedModel,
    });
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert("File too large. Max 5MB allowed.");
      return;
    }

    setUploading(true);
    try {
      // For now, create a local object URL since backend may not support uploads
      const objectUrl = URL.createObjectURL(file);
      const mockAttachment = {
        id: crypto.randomUUID(),
        name: file.name,
        url: objectUrl,
      };
      setAttachments(prev => [...prev, mockAttachment]);
    } catch (err) {
      console.error("File handling failed:", err);
    } finally {
      setUploading(false);
      // Reset input so same file can be selected again
      e.target.value = "";
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleMicToggle = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
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
    <div className="flex h-full">
      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
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

          <div className="flex items-center gap-2">
            {/* Model Router Popup Button */}
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden lg:flex items-center gap-2"
                >
                  <BarChart3 className="h-4 w-4" />
                  Model Router
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[420px] sm:w-[540px] p-0">
                <SheetHeader className="px-6 py-4 border-b">
                  <SheetTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    Model Router Dashboard
                  </SheetTitle>
                </SheetHeader>
                <div className="p-4 overflow-auto h-[calc(100vh-80px)]">
                  <RoutingDashboard />
                </div>
              </SheetContent>
            </Sheet>

            <ChatHistoryButton
              sessions={sessions}
              currentSessionId={currentSessionId}
              onSelectSession={loadSession}
              onCreateSession={createSession}
              onDeleteSession={deleteSession}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggleTheme}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={createSession}
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              New Chat
            </Button>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 px-4 py-4" ref={scrollRef}>
          <div className="mx-auto max-w-3xl space-y-4">
            {(!currentSession || currentSession.messages.length === 0) && (
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

                {/* Agent Cards with Avatars */}
                {agentsData && agentsData.agents.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-muted-foreground">Your Team</h3>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {agentsData.agents.map((agent) => (
                        <Card
                          key={agent.id}
                          className={cn(
                            "flex items-center gap-3 p-3",
                            agent.status === "active" ? "opacity-100" : "opacity-60"
                          )}
                        >
                          <AgentAvatar
                            role={agent.role}
                            name={agent.name}
                            status={agent.status}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{agent.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{agent.roleLabel}</p>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {currentSession?.messages.map((message) => (
              <ChatMessageItem
                key={message.id}
                message={message}
                onNavigate={(url) => navigate(url)}
              />
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
        <div className="border-t border-border px-4 py-4">
          <div className="mx-auto max-w-3xl space-y-2">
            {/* Attachments preview */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1 text-xs shadow-sm"
                  >
                    <Paperclip className="h-3 w-3" />
                    <span className="truncate max-w-[150px]">{att.name}</span>
                    <button
                      onClick={() => removeAttachment(att.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                title="Attach file"
                className="shrink-0"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              </Button>

              {speechSupported && (
                <Button
                  variant={isListening ? "destructive" : "ghost"}
                  size="icon"
                  onClick={handleMicToggle}
                  title={isListening ? "Stop listening" : "Voice input"}
                >
                  {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
              )}

              {/* Provider/Model Selector Dropdown */}
              <div className="relative shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowModelDropdown(!showModelDropdown)}
                  className="flex items-center gap-2 h-10 px-3"
                >
                  {(() => {
                    const p = PROVIDERS.find(pr => pr.id === selectedProvider);
                    const Icon = p?.icon || Zap;
                    return <Icon className={`h-4 w-4 ${p?.color || "text-muted-foreground"}`} />;
                  })()}
                  <span className="text-xs">
                    {selectedProvider === "auto" ? "Auto" : PROVIDERS.find(p => p.id === selectedProvider)?.label}
                  </span>
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </Button>

                {showModelDropdown && (
                  <div className="absolute bottom-full left-0 mb-2 w-64 rounded-lg border border-border bg-card shadow-lg z-50">
                    <div className="p-2">
                      <p className="text-xs font-medium text-muted-foreground px-2 py-1">Provider</p>
                      {PROVIDERS.map((provider) => {
                        const Icon = provider.icon;
                        return (
                          <button
                            key={provider.id}
                            onClick={() => {
                              setSelectedProvider(provider.id);
                              setSelectedModel("auto");
                            }}
                            className={`flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm transition-colors ${
                              selectedProvider === provider.id ? "bg-accent" : "hover:bg-accent/50"
                            }`}
                          >
                            <Icon className={`h-4 w-4 ${provider.color}`} />
                            <span>{provider.label}</span>
                            {selectedProvider === provider.id && <Check className="h-3 w-3 ml-auto text-primary" />}
                          </button>
                        );
                      })}
                    </div>

                    {selectedProvider !== "auto" && (
                      <div className="border-t border-border p-2">
                        <p className="text-xs font-medium text-muted-foreground px-2 py-1">Model</p>
                        {MODELS_BY_PROVIDER[selectedProvider]?.map((model) => (
                          <button
                            key={model.id}
                            onClick={() => {
                              setSelectedModel(model.id);
                              setShowModelDropdown(false);
                            }}
                            className={`flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm transition-colors ${
                              selectedModel === model.id ? "bg-accent" : "hover:bg-accent/50"
                            }`}
                          >
                            <Cpu className="h-3 w-3 text-muted-foreground" />
                            <span>{model.label}</span>
                            {selectedModel === model.id && <Check className="h-3 w-3 ml-auto text-primary" />}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="border-t border-border p-2">
                      <button
                        onClick={() => {
                          setSelectedProvider("auto");
                          setSelectedModel("auto");
                          setShowModelDropdown(false);
                        }}
                        className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent/50 transition-colors"
                      >
                        <RefreshCw className="h-3 w-3" />
                        <span>Reset to Auto</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

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
      </div>

    </div>
  );
}
