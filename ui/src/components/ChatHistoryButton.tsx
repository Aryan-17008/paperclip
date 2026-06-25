import { useState } from "react";
import {
  History,
  X,
  MessageSquare,
  Trash2,
  ChevronRight,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ChatSession } from "@/hooks/useChatHistory";
import { ChatMessageItem } from "./ChatMessage";

interface ChatHistoryButtonProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onCreateSession: () => void;
  onDeleteSession: (id: string) => void;
}

export function ChatHistoryButton({
  sessions,
  currentSessionId,
  onSelectSession,
  onCreateSession,
  onDeleteSession,
}: ChatHistoryButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [previewSessionId, setPreviewSessionId] = useState<string | null>(null);

  const previewSession = sessions.find((s) => s.id === previewSessionId);

  return (
    <>
      {/* History Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "gap-2 transition-all",
          isOpen && "bg-primary/10 text-primary border-primary/30"
        )}
      >
        <History className="h-4 w-4" />
        <span className="hidden sm:inline">History</span>
        {sessions.length > 0 && (
          <span className="ml-1 text-xs bg-muted px-1.5 py-0.5 rounded-full">
            {sessions.length}
          </span>
        )}
      </Button>

      {/* Side Panel */}
      {isOpen && (
        <>
          {/* Overlay for mobile */}
          <div
            className="fixed inset-0 z-40 bg-black/30 lg:hidden"
            onClick={() => setIsOpen(false)}
          />

          <div className="fixed inset-y-0 right-0 z-50 w-96 border-l border-border bg-background shadow-xl flex flex-col animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border p-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <h2 className="font-semibold">Chat History</h2>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={onCreateSession}>
                  <MessageSquare className="mr-1 h-3.5 w-3.5" />
                  New
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    setIsOpen(false);
                    setPreviewSessionId(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Content */}
            <div className="flex flex-1 min-h-0">
              {/* Sessions List */}
              <div
                className={cn(
                  "flex flex-col border-r border-border transition-all",
                  previewSession ? "w-1/2" : "w-full"
                )}
              >
                <ScrollArea className="flex-1">
                  <div className="space-y-0.5 p-2">
                    {sessions.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                        <MessageSquare className="mx-auto h-8 w-8 mb-2 opacity-50" />
                        No chats yet
                      </div>
                    ) : (
                      sessions.map((session) => (
                        <button
                          key={session.id}
                          onClick={() => {
                            if (previewSessionId === session.id) {
                              onSelectSession(session.id);
                              setPreviewSessionId(null);
                              setIsOpen(false);
                            } else {
                              setPreviewSessionId(session.id);
                            }
                          }}
                          onMouseEnter={() => setHoveredId(session.id)}
                          onMouseLeave={() => setHoveredId(null)}
                          className={cn(
                            "w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors group",
                            currentSessionId === session.id
                              ? "bg-primary/10 text-primary"
                              : previewSessionId === session.id
                              ? "bg-accent"
                              : "hover:bg-accent/50"
                          )}
                        >
                          <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {session.title}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {session.messages.length} msgs ·{" "}
                              {new Date(session.updatedAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            {previewSessionId === session.id && (
                              <ChevronRight className="h-3.5 w-3.5 text-primary" />
                            )}
                            {hoveredId === session.id &&
                              previewSessionId !== session.id && (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="opacity-0 group-hover:opacity-100 h-6 w-6"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteSession(session.id);
                                  }}
                                >
                                  <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                                </Button>
                              )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* Preview Panel */}
              {previewSession && (
                <div className="w-1/2 flex flex-col bg-muted/20">
                  {/* Preview Header */}
                  <div className="border-b border-border p-3">
                    <h3 className="font-semibold text-sm truncate">
                      {previewSession.title}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {previewSession.messages.length} messages
                    </p>
                  </div>

                  {/* Preview Messages */}
                  <ScrollArea className="flex-1 p-2">
                    <div className="space-y-2">
                      {previewSession.messages.slice(-8).map((message) => (
                        <ChatMessageItem
                          key={message.id}
                          message={message}
                          animateTyping={false}
                        />
                      ))}
                      {previewSession.messages.length > 8 && (
                        <p className="text-center text-xs text-muted-foreground py-1">
                          +{previewSession.messages.length - 8} more
                        </p>
                      )}
                    </div>
                  </ScrollArea>

                  {/* Open Button */}
                  <div className="border-t border-border p-3">
                    <Button
                      className="w-full"
                      size="sm"
                      onClick={() => {
                        onSelectSession(previewSession.id);
                        setPreviewSessionId(null);
                        setIsOpen(false);
                      }}
                    >
                      Open Chat
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
