"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/api";
import {
  Plus,
  Send,
  Trash2,
  MessageSquare,
  Loader2,
  Bot,
  User,
} from "lucide-react";
import type {
  Conversation,
  Message,
  ChatStreamEvent,
} from "@/types/chat";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function ChatPage() {
  const token = useAuthStore((s) => s.accessToken);

  // State
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [loading, setLoading] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  // Load conversations on mount
  useEffect(() => {
    if (!token) return;
    loadConversations();
  }, [token]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!token || !activeConversationId) {
      setMessages([]);
      return;
    }
    loadMessages(activeConversationId);
  }, [token, activeConversationId]);

  async function loadConversations() {
    try {
      const data = await apiFetch<Conversation[]>("/api/chat/conversations", {
        token: token!,
      });
      setConversations(data);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }

  async function loadMessages(conversationId: string) {
    try {
      const data = await apiFetch<Message[]>(
        `/api/chat/conversations/${conversationId}/messages`,
        { token: token! }
      );
      setMessages(data);
    } catch {
      // ignore
    }
  }

  async function handleNewConversation() {
    try {
      const conv = await apiFetch<Conversation>("/api/chat/conversations", {
        method: "POST",
        token: token!,
      });
      setConversations((prev) => [conv, ...prev]);
      setActiveConversationId(conv.id);
      setMessages([]);
      setInputValue("");
      textareaRef.current?.focus();
    } catch {
      // ignore
    }
  }

  async function handleDeleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await apiFetch(`/api/chat/conversations/${id}`, {
        method: "DELETE",
        token: token!,
      });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch {
      // ignore
    }
  }

  async function handleSendMessage() {
    if (!inputValue.trim() || isStreaming) return;

    let conversationId = activeConversationId;

    // Auto-create conversation if none is active
    if (!conversationId) {
      try {
        const conv = await apiFetch<Conversation>("/api/chat/conversations", {
          method: "POST",
          token: token!,
        });
        setConversations((prev) => [conv, ...prev]);
        setActiveConversationId(conv.id);
        conversationId = conv.id;
      } catch {
        return;
      }
    }

    const userContent = inputValue.trim();
    setInputValue("");
    setIsStreaming(true);
    setStreamingContent("");

    // Optimistically add user message
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: conversationId,
      role: "user",
      content: userContent,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    // Start SSE stream
    try {
      const response = await fetch(
        `${API_URL}/api/chat/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content: userContent }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let accumulated = "";
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        accumulated += decoder.decode(value, { stream: true });

        // Process SSE lines
        const lines = accumulated.split("\n");
        // Keep the last potentially incomplete line
        accumulated = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event: ChatStreamEvent = JSON.parse(jsonStr);

            if (event.type === "delta") {
              fullContent += event.content;
              setStreamingContent(fullContent);
            } else if (event.type === "done") {
              // Add the final assistant message
              const assistantMsg: Message = {
                id: event.message_id,
                conversation_id: conversationId!,
                role: "assistant",
                content: fullContent,
                created_at: new Date().toISOString(),
              };
              setMessages((prev) => [...prev, assistantMsg]);
              setStreamingContent("");
            } else if (event.type === "error") {
              setStreamingContent("");
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } catch {
      // ignore
    } finally {
      setIsStreaming(false);
      setStreamingContent("");
      // Refresh conversation list to get updated title
      loadConversations();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }

  // Auto-resize textarea
  function handleTextareaInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInputValue(e.target.value);
    const textarea = e.target;
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
  }

  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId
  );

  return (
    <div className="flex h-[calc(100vh-2rem)] gap-0 overflow-hidden">
      {/* Conversation Sidebar */}
      <div className="w-72 flex-shrink-0 border-r border-[var(--border)] bg-[var(--card)] flex flex-col">
        {/* New Chat Button */}
        <div className="p-3 border-b border-[var(--border)]">
          <button
            onClick={handleNewConversation}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Chat
          </button>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--muted-foreground)]" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">
              No conversations yet. Start a new chat!
            </div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => setActiveConversationId(conv.id)}
                className={`group flex items-center gap-2 px-3 py-3 cursor-pointer border-b border-[var(--border)] transition-colors ${
                  activeConversationId === conv.id
                    ? "bg-[var(--accent)]"
                    : "hover:bg-[var(--accent)]/50"
                }`}
              >
                <MessageSquare className="h-4 w-4 flex-shrink-0 text-[var(--muted-foreground)]" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--foreground)] truncate">
                    {conv.title}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {conv.message_count} message{conv.message_count !== 1 ? "s" : ""}
                  </p>
                </div>
                <button
                  onClick={(e) => handleDeleteConversation(conv.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-[var(--muted-foreground)] hover:text-red-500 transition-all"
                  title="Delete conversation"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat Header */}
        <div className="h-14 flex items-center px-6 border-b border-[var(--border)] bg-[var(--card)]">
          <h2 className="text-sm font-semibold text-[var(--foreground)] truncate">
            {activeConversation?.title || "AI Chat Assistant"}
          </h2>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          {!activeConversationId && messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="h-16 w-16 rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center mb-4">
                <Bot className="h-8 w-8 text-[var(--primary)]" />
              </div>
              <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">
                How can I help you today?
              </h3>
              <p className="text-sm text-[var(--muted-foreground)] max-w-md">
                Ask me anything about your schedule, emails, travel plans, or any
                topic you need assistance with.
              </p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {msg.role === "assistant" && (
                    <div className="h-8 w-8 rounded-full bg-[var(--primary)]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="h-4 w-4 text-[var(--primary)]" />
                    </div>
                  )}
                  <div
                    className={`rounded-2xl px-4 py-3 max-w-[80%] ${
                      msg.role === "user"
                        ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                        : "bg-[var(--muted)] text-[var(--foreground)]"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {msg.content}
                    </p>
                  </div>
                  {msg.role === "user" && (
                    <div className="h-8 w-8 rounded-full bg-[var(--muted)] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User className="h-4 w-4 text-[var(--muted-foreground)]" />
                    </div>
                  )}
                </div>
              ))}

              {/* Streaming response */}
              {isStreaming && streamingContent && (
                <div className="flex gap-3 justify-start">
                  <div className="h-8 w-8 rounded-full bg-[var(--primary)]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="h-4 w-4 text-[var(--primary)]" />
                  </div>
                  <div className="rounded-2xl px-4 py-3 max-w-[80%] bg-[var(--muted)] text-[var(--foreground)]">
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {streamingContent}
                      <span className="inline-block w-2 h-4 bg-[var(--foreground)] animate-pulse ml-0.5 align-middle" />
                    </p>
                  </div>
                </div>
              )}

              {/* Loading indicator when streaming hasn't started yet */}
              {isStreaming && !streamingContent && (
                <div className="flex gap-3 justify-start">
                  <div className="h-8 w-8 rounded-full bg-[var(--primary)]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="h-4 w-4 text-[var(--primary)]" />
                  </div>
                  <div className="rounded-2xl px-4 py-3 bg-[var(--muted)]">
                    <div className="flex gap-1.5">
                      <div className="h-2 w-2 rounded-full bg-[var(--muted-foreground)] animate-bounce [animation-delay:0ms]" />
                      <div className="h-2 w-2 rounded-full bg-[var(--muted-foreground)] animate-bounce [animation-delay:150ms]" />
                      <div className="h-2 w-2 rounded-full bg-[var(--muted-foreground)] animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Message Input */}
        <div className="border-t border-[var(--border)] bg-[var(--card)] p-4">
          <div className="max-w-3xl mx-auto flex items-end gap-3">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
              rows={1}
              disabled={isStreaming}
              className="flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-50"
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isStreaming}
              className="flex-shrink-0 h-11 w-11 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
