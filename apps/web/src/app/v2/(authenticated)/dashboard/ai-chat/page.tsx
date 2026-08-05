"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Icon } from "@/base";
import { ActionLink } from "@/components/ActionLink";
import { ContentPage } from "@/components/ContentPage";
import { EmptyState } from "@/components/EmptyState";
import { FeedbackMessage } from "@/components/FeedbackMessage";
import { LoadingState } from "@/components/LoadingState";
import { HighlightButton } from "@/components/HighlightButton";
import { MarkdownContent } from "@/components/MarkdownContent";
import { PageTransition } from "@/components/PageTransition";
import { SecondaryButton } from "@/components/SecondaryButton";
import { TextAreaField } from "@/components/TextAreaField";
import { useConfirmation } from "@/compositions/ConfirmationProvider";

import {
  clearChatHistory,
  getAIProvider,
  getChatHistory,
  sendAIChat,
  type ChatHistoryMessage,
} from "@/lib/api";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  disclaimer?: string;
}

function toChatMessage(message: ChatHistoryMessage): ChatMessage {
  return {
    content: message.content,
    disclaimer: message.disclaimer ?? undefined,
    id: message.id,
    role: message.role,
    timestamp: new Date(message.timestamp),
  };
}

type ProviderState = "checking" | "configured" | "missing" | "offline";

function isMissingProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  return (
    message.includes("No AI provider configured") || message.includes("404")
  );
}

export default function AIChatPage() {
  const { confirm } = useConfirmation();
  const [providerState, setProviderState] = useState<ProviderState>("checking");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAttemptedChat, setHasAttemptedChat] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendInFlightRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    const messagesElement = messagesRef.current;
    if (!messagesElement) return;

    messagesElement.scrollTop = messagesElement.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!isLoadingHistory && !isSending) {
      inputRef.current?.focus();
    }
  }, [isLoadingHistory, isSending]);

  // Check provider availability and restore the current server conversation.
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        await getAIProvider();
        if (cancelled) return;
        setProviderState("configured");

        try {
          const history = await getChatHistory();
          if (cancelled) return;
          setMessages(history.messages.map(toChatMessage));
        } catch {
          // History is supplementary. Keep the chat usable if it cannot load.
        }
      } catch (err) {
        if (cancelled) return;
        if (isMissingProviderError(err)) {
          setProviderState("missing");
        } else {
          setProviderState("offline");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingHistory(false);
        }
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRetry = useCallback(async () => {
    setProviderState("checking");
    setIsLoadingHistory(true);
    try {
      await getAIProvider();
      setProviderState("configured");

      try {
        const history = await getChatHistory();
        setMessages(history.messages.map(toChatMessage));
      } catch {
        // History is supplementary. Keep the chat usable if it cannot load.
      }
    } catch (err) {
      if (isMissingProviderError(err)) {
        setProviderState("missing");
      } else {
        setProviderState("offline");
      }
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoadingHistory || isSending || sendInFlightRef.current)
      return;

    setError(null);
    setHasAttemptedChat(true);

    if (providerState === "missing") return;

    sendInFlightRef.current = true;
    setIsSending(true);
    let userMessageId: string | null = null;

    try {
      if (providerState === "checking") {
        await getAIProvider();
        setProviderState("configured");
      }

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: trimmed,
        timestamp: new Date(),
      };
      userMessageId = userMessage.id;

      setMessages((prev) => [...prev, userMessage]);
      setInput("");

      const response = await sendAIChat(trimmed);
      const assistantMessage: ChatMessage = {
        id: response.message_id || `assistant-${Date.now()}`,
        role: "assistant",
        content: response.response,
        timestamp: new Date(),
        disclaimer: response.disclaimer,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      if (userMessageId === null) {
        if (isMissingProviderError(err)) {
          setProviderState("missing");
        } else {
          setProviderState("offline");
        }
      } else if (isMissingProviderError(err)) {
        setMessages((previous) =>
          previous.filter((message) => message.id !== userMessageId),
        );
        setInput(trimmed);
        setProviderState("missing");
      } else {
        const message =
          err instanceof Error ? err.message : "Failed to get response";
        setError(message);
      }
    } finally {
      sendInFlightRef.current = false;
      setIsSending(false);
    }
  }, [input, isLoadingHistory, isSending, providerState]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.nativeEvent.isComposing) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  const handleClearChat = useCallback(async () => {
    if (sendInFlightRef.current) return;
    const confirmed = await confirm({
      confirmLabel: "Clear conversation",
      description:
        "This cannot be undone. Every message in this conversation will be permanently removed.",
      title: "Clear this conversation?",
      tone: "destructive",
    });
    if (!confirmed) {
      return;
    }
    try {
      await clearChatHistory();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "The conversation could not be cleared. Please try again.",
      );
      return;
    }
    setMessages([]);
    setError(null);
    setHasAttemptedChat(false);
  }, [confirm]);

  const providerRequiredMessage =
    providerState === "missing" && hasAttemptedChat ? (
      <FeedbackMessage
        className="w-full max-w-2xl text-left"
        message={
          <span className="flex flex-col items-start gap-3">
            <span>
              Configure an AI provider before starting a conversation.
            </span>
            <ActionLink href="/settings/ai" variant="secondary">
              <Icon className="h-5 w-5" decorative icon="gear" />
              Configure AI provider
            </ActionLink>
          </span>
        }
        title="AI provider required"
        variant="info"
      />
    ) : null;

  if (providerState === "offline") {
    return (
      <PageTransition>
        <ContentPage>
          <EmptyState
            action={
              <SecondaryButton onClick={handleRetry}>
                Retry Connection
              </SecondaryButton>
            }
            description="Cannot reach the server. Please check your connection and try again."
            icon="circle-slash"
            title="Unable to Connect"
          />
        </ContentPage>
      </PageTransition>
    );
  }

  return (
    <PageTransition className="h-full min-h-0 overflow-hidden">
      <ContentPage className="flex h-full min-h-0 max-w-5xl flex-col space-y-0 py-0">
        <section
          aria-label="AI chat"
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel border border-border-default bg-surface-elevated"
        >
          <div
            aria-label="Chat messages"
            aria-live="polite"
            className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:p-6"
            ref={messagesRef}
            role="log"
          >
            {isLoadingHistory ? (
              <LoadingState
                className="h-full min-h-0"
                label="Loading conversation..."
              />
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center space-y-5 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-pill bg-surface-secondary text-foreground-primary">
                  <Icon className="h-7 w-7" decorative icon="chat-bubbles" />
                </span>
                <div>
                  <h2 className="font_poppins font_header_3 text-foreground-primary">
                    Start a conversation
                  </h2>
                  <p className="font_poppins font_body_2 mt-2 text-foreground-primary">
                    Ask about your glucose patterns, trends, or any
                    diabetes-related questions.
                  </p>
                </div>
                <div className="flex max-w-2xl flex-wrap justify-center gap-2">
                  {[
                    "How am I doing today?",
                    "Why do I spike after breakfast?",
                    "What are my patterns this week?",
                    "How is my time in range?",
                  ].map((suggestion) => (
                    <SecondaryButton
                      key={suggestion}
                      onClick={() => {
                        setInput(suggestion);
                        setHasAttemptedChat(true);
                        inputRef.current?.focus();
                      }}
                    >
                      {suggestion}
                    </SecondaryButton>
                  ))}
                </div>
                {providerRequiredMessage}
              </div>
            ) : null}

            {messages.map((message) => (
              <div
                className={
                  message.role === "user"
                    ? "flex justify-end"
                    : "flex justify-start"
                }
                key={message.id}
              >
                <div
                  className={
                    message.role === "user"
                      ? "group flex max-w-[85%] flex-col items-end sm:max-w-[75%]"
                      : "group flex max-w-[85%] flex-col items-start sm:max-w-[75%]"
                  }
                >
                  <article
                    className={
                      message.role === "user"
                        ? "w-fit max-w-full rounded-panel bg-accent px-3 py-2 text-accent-foreground"
                        : "w-fit max-w-full rounded-panel border border-border-default bg-surface-primary px-3 py-2 text-foreground-primary"
                    }
                  >
                    {message.role === "assistant" ? (
                      <MarkdownContent content={message.content} />
                    ) : (
                      <p className="font_poppins font_body_2 whitespace-pre-wrap">
                        {message.content}
                      </p>
                    )}
                    {message.disclaimer ? (
                      <p className="font_metric_caption mt-3 border-t border-border-default pt-2 text-foreground-primary">
                        {message.disclaimer}
                      </p>
                    ) : null}
                  </article>
                  <time className="font_metric_caption mt-1 block px-1 text-foreground-primary transition-opacity motion-reduce:transition-none lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
                    {message.timestamp.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              </div>
            ))}

            {messages.length > 0 ? providerRequiredMessage : null}

            {isSending ? (
              <LoadingState className="min-h-32" label="AI is thinking..." />
            ) : null}

            {error ? (
              <FeedbackMessage
                className="mx-auto max-w-xl"
                message={error}
                title="Message failed"
                variant="error"
              />
            ) : null}
          </div>

          <p className="font_metric_caption px-4 pb-2 text-center text-foreground-primary">
            Not medical advice. Consult your healthcare provider.
          </p>

          <div className="border-t border-border-default bg-surface-primary p-4">
            <div
              aria-label="Chat controls"
              className="flex items-end gap-3"
              role="group"
            >
              <TextAreaField
                aria-label="Message input"
                autoFocus
                className="max-h-32 min-h-12 resize-none focus-visible:ring-1"
                containerClassName="min-w-0 flex-1 gap-0"
                disabled={isLoadingHistory || isSending}
                label="Message input"
                labelClassName="sr-only"
                maxLength={2000}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your glucose data..."
                ref={inputRef}
                rows={1}
                value={input}
              />
              {messages.length > 0 ? (
                <SecondaryButton
                  aria-label="Clear chat history"
                  className="h-12"
                  disabled={isSending}
                  onClick={handleClearChat}
                >
                  <Icon className="h-4 w-4" decorative icon="trash" />
                  Clear
                </SecondaryButton>
              ) : null}
              <HighlightButton
                aria-label="Send message"
                className="h-12"
                disabled={isLoadingHistory || !input.trim() || isSending}
                onClick={handleSend}
              >
                {isSending ? "Sending..." : "Send"}
              </HighlightButton>
            </div>
          </div>
        </section>
      </ContentPage>
    </PageTransition>
  );
}
