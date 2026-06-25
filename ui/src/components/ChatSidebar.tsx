import { useState } from "react";
import {
  Plus,
  Trash2,
  MessageSquare,
  X,
  History,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ChatSession } from "@/hooks/useChatHistory";
import { ChatMessageItem } from "./ChatMessage";

interface ChatSidebarProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onCreateSession: () => void;
  onDeleteSession: (id: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function ChatSidebar({
  sessions,
  currentSessionId,
  onSelectSession,
  onCreateSession,
  onDeleteSession,
  isOpen,
  onClose,
}: ChatSidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [previewSessionId, setPreviewSessionId] = useState<string | null>(null);

  const previewSession = sessions.find((s) => s.id === previewSessionId);

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 border-r border-border bg-background flex transition-transform duration-200 lg:static lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Sessions List */}
        <div className="w-72 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border p-4">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold">Chat History</h2>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onCreateSession}
                title="New chat"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
                className="lg:hidden"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Sessions list */}
          <ScrollArea className="flex-1">
            <div className="space-y-1 p-2">
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
                      } else {
                        setPreviewSessionId(session.id);
                      }
                    }}
                    onMouseEnter={() => setHoveredId(session.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors group",
                      currentSessionId === session.id
                        ? "bg-primary/10 text-primary"
                        : previewSessionId === session.id
                        ? "bg-accent/70"
                        : "hover:bg-accent/50"
                    )}
                  >
                    <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {session.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {session.messages.length} messages ·{" "}
                        {new Date(session.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    {previewSessionId === session.id && (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    {hoveredId === session.id && previewSessionId !== session.id && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSession(session.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                      </Button>
                    )}
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Preview Panel */}
        {previewSession && (
          <div className="w-80 border-l border-border bg-muted/30 flex flex-col">
            {/* Preview Header */}
            <div className="flex items-center justify-between border-b border-border p-4">
              <div className="min-w-0">
                <h3 className="font-semibold text-sm truncate">
                  {previewSession.title}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {previewSession.messages.length} messages
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSelectSession(previewSession.id)}
                >
                  Open
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setPreviewSessionId(null)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Preview Messages */}
            <ScrollArea className="flex-1 p-3">
              <div className="space-y-3">
                {previewSession.messages.slice(-10).map((message) => (
                  <ChatMessageItem
                    key={message.id}
                    message={message}
                    animateTyping={false}
                  />
                ))}
                {previewSession.messages.length > 10 && (
                  <p className="text-center text-xs text-muted-foreground py-2">
                    +{previewSession.messages.length - 10} more messages
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </>
  );
}
