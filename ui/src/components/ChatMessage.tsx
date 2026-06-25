import { useState, useEffect, useRef } from "react";
import { Bot, User, CheckCircle2, ExternalLink, Loader2, FileText, Mic, ChevronDown, Zap, Cpu, BrainCircuit, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTypingAnimation } from "@/hooks/useTypingAnimation";
import type { ChatMessage as ChatMessageType } from "@/api/chat";

interface ChatMessageProps {
  message: ChatMessageType;
  onNavigate?: (url: string) => void;
  onUpdateModel?: (issueId: string, model: string) => void;
  animateTyping?: boolean;
}

const statusColors: Record<string, string> = {
  todo: "bg-yellow-500/20 text-yellow-600",
  in_progress: "bg-blue-500/20 text-blue-600",
  in_review: "bg-purple-500/20 text-purple-600",
  done: "bg-green-500/20 text-green-600",
  blocked: "bg-red-500/20 text-red-600",
  cancelled: "bg-gray-500/20 text-gray-600",
};

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const AVAILABLE_MODELS = [
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

export function ChatMessageItem({ message, onNavigate, onUpdateModel, animateTyping = true }: ChatMessageProps) {
  const isBot = message.type === "bot";
  const [showFullReason, setShowFullReason] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [selectedOverrideModel, setSelectedOverrideModel] = useState<string | null>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);

  const PROVIDER_META: Record<string, { icon: typeof Zap; color: string; label: string }> = {
    auto: { icon: Zap, color: "text-amber-500", label: "Auto" },
    kimi: { icon: BrainCircuit, color: "text-emerald-500", label: "Kimi" },
    openai: { icon: Cpu, color: "text-blue-500", label: "OpenAI" },
    anthropic: { icon: BrainCircuit, color: "text-orange-500", label: "Anthropic" },
    gemini: { icon: Zap, color: "text-purple-500", label: "Gemini" },
    groq: { icon: Cpu, color: "text-cyan-500", label: "Groq" },
  };

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

  // Close model picker on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false);
      }
    }
    if (showModelPicker) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showModelPicker]);

  const { displayedText, isComplete, skip } = useTypingAnimation(
    message.content,
    25,
    animateTyping && isBot
  );

  // Auto-skip typing for non-routing bot messages after a delay
  useEffect(() => {
    if (!isBot || message.routing) return;
    const timer = setTimeout(() => skip(), 3000);
    return () => clearTimeout(timer);
  }, [isBot, message.routing, skip]);

  return (
    <div className={cn("flex gap-3", isBot ? "justify-start" : "justify-end")}>
      {isBot && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Bot className="h-4 w-4 text-primary" />
        </div>
      )}

      <div className={cn("max-w-[80%] space-y-2", isBot ? "" : "order-first")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5",
            isBot ? "bg-muted" : "bg-primary text-primary-foreground"
          )}
        >
          <p className="text-sm whitespace-pre-wrap">
            {animateTyping && isBot ? displayedText : message.content}
          </p>

          {/* Typing indicator */}
          {animateTyping && isBot && !isComplete && (
            <span className="inline-block ml-1 animate-pulse">▋</span>
          )}

          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-3 space-y-2">
              {message.attachments.map((att) => (
                <a
                  key={att.id}
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-border bg-background/50 p-2 text-xs hover:bg-accent/50 transition-colors"
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate flex-1">{att.name}</span>
                  <span className="text-muted-foreground">{(att.size / 1024).toFixed(1)} KB</span>
                </a>
              ))}
            </div>
          )}

          {/* Routing details */}
          {message.routing && (
            <div className="mt-3 space-y-2 rounded-lg border border-border bg-background/50 p-3">
              {/* Complexity Badge */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-medium",
                  message.routing.complexity === "simple" && "bg-green-500/20 text-green-600",
                  message.routing.complexity === "medium" && "bg-yellow-500/20 text-yellow-600",
                  message.routing.complexity === "complex" && "bg-red-500/20 text-red-600"
                )}>
                  {message.routing.complexity}
                </span>
                {message.routing.wasOverridden && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-600 font-medium">
                    manual override
                  </span>
                )}
                {message.routing.estimatedSavingsPercent > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 font-medium">
                    💰 {message.routing.estimatedSavingsPercent}% savings
                  </span>
                )}
                {message.routing.provider && (
                  <div className="relative" ref={modelPickerRef}>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium border cursor-pointer hover:opacity-80 inline-flex items-center gap-1"
                      style={{
                        backgroundColor: `${message.routing.providerColor}20`,
                        borderColor: `${message.routing.providerColor}40`,
                        color: message.routing.providerColor,
                      }}
                      title={`API Key: ${message.routing.apiKeyName} — Click to change model`}
                      onClick={() => setShowModelPicker(!showModelPicker)}
                    >
                      {(() => {
                        const p = PROVIDER_META[message.routing.provider?.toLowerCase() || "auto"];
                        const Icon = p?.icon || Zap;
                        return <Icon className={`h-3 w-3 ${p?.color || ""}`} />;
                      })()}
                      {message.routing.provider}
                      {message.routing.selectedModel && ` • ${message.routing.selectedModel}`}
                      <ChevronDown className="h-3 w-3" />
                    </span>

                    {/* Model Override Dropdown */}
                    {showModelPicker && (
                      <div className="absolute top-full left-0 mt-1 w-64 rounded-lg border border-border bg-card shadow-lg z-50">
                        <div className="p-2">
                          <p className="text-xs font-medium text-muted-foreground px-2 py-1">Change Model</p>
                          {Object.entries(MODELS_BY_PROVIDER).map(([providerId, models]) => {
                            const meta = PROVIDER_META[providerId];
                            const Icon = meta?.icon || Zap;
                            return (
                              <div key={providerId}>
                                <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
                                  <Icon className={`h-3 w-3 ${meta?.color}`} />
                                  <span>{meta?.label || providerId}</span>
                                </div>
                                {models.map((model) => (
                                  <button
                                    key={model.id}
                                    onClick={() => {
                                      setSelectedOverrideModel(model.id);
                                      setShowModelPicker(false);
                                      if (model.id !== "auto" && message.routing?.issueUrl) {
                                        const issueId = message.routing.issueUrl.split("/").pop();
                                        if (issueId) onUpdateModel?.(issueId, model.id);
                                      }
                                    }}
                                    className={`flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm transition-colors ${
                                      (selectedOverrideModel || message.routing.selectedModel) === model.id
                                        ? "bg-accent"
                                        : "hover:bg-accent/50"
                                    }`}
                                  >
                                    <Cpu className="h-3 w-3 text-muted-foreground" />
                                    <span>{model.label}</span>
                                    {(selectedOverrideModel || message.routing.selectedModel) === model.id && (
                                      <Check className="h-3 w-3 ml-auto text-primary" />
                                    )}
                                  </button>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                        <div className="border-t border-border p-2">
                          <button
                            onClick={() => {
                              setSelectedOverrideModel(null);
                              setShowModelPicker(false);
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
                )}
              </div>

              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">
                  Issue created: {message.routing.issueIdentifier}
                </span>
              </div>

              {/* Why this agent */}
              <div className="space-y-1">
                <button
                  onClick={() => setShowFullReason(!showFullReason)}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  {showFullReason ? "Hide" : "Why this agent?"}
                </button>
                {showFullReason && (
                  <div className="text-xs text-muted-foreground bg-background/80 rounded p-2 space-y-1">
                    <p><strong>Role:</strong> {message.routing.roleLabel}</p>
                    <p><strong>Confidence:</strong> {Math.round(message.routing.confidence * 100)}%</p>
                    <p><strong>Reason:</strong> {message.routing.reason}</p>
                    {message.routing.provider && (
                      <p>
                        <strong>Provider:</strong>{" "}
                        <span style={{ color: message.routing.providerColor }}>
                          {message.routing.provider}
                        </span>
                        {message.routing.selectedModel && ` (${message.routing.selectedModel})`}
                      </p>
                    )}
                    {message.routing.apiKeyName && (
                      <p><strong>API Key:</strong> {message.routing.apiKeyName}</p>
                    )}
                    {message.routing.cacheHit !== undefined && (
                      <p><strong>Cache:</strong> {message.routing.cacheHit ? "Hit" : "Miss"}</p>
                    )}
                    {message.routing.estimatedLatencyMs !== null && message.routing.estimatedLatencyMs !== undefined && (
                      <p><strong>Est. Latency:</strong> {message.routing.estimatedLatencyMs}ms</p>
                    )}
                  </div>
                )}
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
                onClick={() => onNavigate?.(message.routing!.issueUrl)}
              >
                <ExternalLink className="mr-2 h-3 w-3" />
                View Issue
              </Button>
            </div>
          )}

          {/* Task Progress */}
          {message.taskProgress && (
            <div className="mt-3 rounded-lg border border-border bg-background/50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{message.taskProgress.identifier}</span>
                <span className={cn("text-xs px-2 py-0.5 rounded-full", statusColors[message.taskProgress.status] || "bg-gray-500/20")}>
                  {message.taskProgress.status.replace(/_/g, " ")}
                </span>
              </div>
              {message.taskProgress.assigneeName && (
                <p className="text-xs text-muted-foreground">
                  Assigned to: {message.taskProgress.assigneeName}
                </p>
              )}
            </div>
          )}
        </div>

        <p className="text-right text-xs text-muted-foreground px-2">
          {formatTime(message.timestamp)}
        </p>
      </div>

      {!isBot && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary">
          <User className="h-4 w-4 text-primary-foreground" />
        </div>
      )}
    </div>
  );
}
