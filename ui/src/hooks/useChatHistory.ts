import { useState, useEffect, useCallback } from "react";
import type { ChatMessage } from "@/api/chat";

const STORAGE_KEY = "paperclip_chat_history";
const MAX_MESSAGES = 100;

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

function generateId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function getStoredSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSessions(sessions: ChatSession[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // Ignore storage errors
  }
}

export function useChatHistory(companyId: string | null) {
  const [sessions, setSessions] = useState<ChatSession[]>(getStoredSessions);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const currentSession = sessions.find((s) => s.id === currentSessionId) ?? null;

  const createSession = useCallback(() => {
    const newSession: ChatSession = {
      id: generateId(),
      title: "New Chat",
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setSessions((prev) => {
      const updated = [newSession, ...prev].slice(0, 20); // Keep last 20 sessions
      saveSessions(updated);
      return updated;
    });
    setCurrentSessionId(newSession.id);
    return newSession.id;
  }, []);

  const addMessage = useCallback(
    (message: ChatMessage) => {
      if (!currentSessionId) return;
      setSessions((prev) => {
        const updated = prev.map((session) => {
          if (session.id !== currentSessionId) return session;
          const messages = [...session.messages, message].slice(-MAX_MESSAGES);
          // Auto-update title from first user message
          const title =
            session.title === "New Chat" && message.type === "user"
              ? message.content.slice(0, 40) + (message.content.length > 40 ? "..." : "")
              : session.title;
          return {
            ...session,
            title,
            messages,
            updatedAt: new Date().toISOString(),
          };
        });
        saveSessions(updated);
        return updated;
      });
    },
    [currentSessionId]
  );

  const loadSession = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
  }, []);

  const deleteSession = useCallback((sessionId: string) => {
    setSessions((prev) => {
      const updated = prev.filter((s) => s.id !== sessionId);
      saveSessions(updated);
      return updated;
    });
    setCurrentSessionId((prev) => (prev === sessionId ? null : prev));
  }, []);

  const clearAllSessions = useCallback(() => {
    setSessions([]);
    saveSessions([]);
    setCurrentSessionId(null);
  }, []);

  // Auto-create session on first load
  useEffect(() => {
    if (!currentSessionId && companyId) {
      const existing = sessions[0];
      if (existing && existing.messages.length === 0) {
        setCurrentSessionId(existing.id);
      } else {
        createSession();
      }
    }
  }, [companyId, currentSessionId, sessions, createSession]);

  return {
    sessions,
    currentSession,
    currentSessionId,
    createSession,
    addMessage,
    loadSession,
    deleteSession,
    clearAllSessions,
  };
}
