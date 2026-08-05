/**
 * Story 11.2: Web-Based AI Chat Interface
 *
 * Tests for the AI Chat page including all states (checking, no-provider,
 * offline, ready), message sending, error handling, and UI interactions.
 */

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

// Mock next/navigation
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  usePathname: () => "/dashboard/ai-chat",
}));

// Mock next/link
jest.mock("next/link", () => {
  return function MockLink({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  };
});

// Mock API functions
const mockGetAIProvider = jest.fn();
const mockGetChatHistory = jest.fn();
const mockSendAIChat = jest.fn();
const mockClearChatHistory = jest.fn();
const mockConfirm = jest.fn();

jest.mock("@/compositions/ConfirmationProvider", () => ({
  useConfirmation: () => ({ confirm: mockConfirm }),
}));

jest.mock("@/lib/api", () => ({
  clearChatHistory: (...args: unknown[]) => mockClearChatHistory(...args),
  getAIProvider: (...args: unknown[]) => mockGetAIProvider(...args),
  getChatHistory: (...args: unknown[]) => mockGetChatHistory(...args),
  sendAIChat: (...args: unknown[]) => mockSendAIChat(...args),
}));

import AIChatPage from "@/app/v2/(authenticated)/dashboard/ai-chat/page";

beforeEach(() => {
  jest.clearAllMocks();
  mockConfirm.mockResolvedValue(true);
  mockClearChatHistory.mockResolvedValue(undefined);
  mockGetChatHistory.mockResolvedValue({
    messages: [],
  });
});

describe("AI Chat Page", () => {
  describe("checking state", () => {
    it("shows the conversation loading state while checking the provider", () => {
      mockGetAIProvider.mockReturnValue(new Promise(() => {}));

      render(<AIChatPage />);

      expect(
        screen.getByRole("status", { name: "Loading conversation..." }),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Start a conversation"),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("textbox", { name: "Message input" }),
      ).toBeDisabled();
    });
  });

  describe("no provider configured", () => {
    beforeEach(() => {
      mockGetAIProvider.mockRejectedValue(
        new Error("No AI provider configured"),
      );
    });

    it("keeps the default empty chat until the user interacts", async () => {
      render(<AIChatPage />);

      expect(
        await screen.findByText("Start a conversation"),
      ).toBeInTheDocument();
      expect(mockGetAIProvider).toHaveBeenCalled();
      expect(
        screen.queryByText("AI provider required"),
      ).not.toBeInTheDocument();
    });

    it("shows provider information after selecting a preset", async () => {
      render(<AIChatPage />);

      await waitFor(() => {
        expect(screen.getByText("How am I doing today?")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("How am I doing today?"));

      const providerAlert = await screen.findByRole("alert");
      expect(providerAlert).toHaveTextContent("AI provider required");
      expect(
        within(providerAlert).getByRole("link", {
          name: "Configure AI provider",
        }),
      ).toHaveAttribute("href", "/settings/ai");
    });

    it("shows provider information instead of sending a message", async () => {
      render(<AIChatPage />);

      const input = await screen.findByRole("textbox", {
        name: "Message input",
      });

      fireEvent.change(input, { target: { value: "How am I doing?" } });
      fireEvent.click(screen.getByRole("button", { name: /send message/i }));

      const providerAlert = await screen.findByRole("alert");
      expect(providerAlert).toHaveTextContent("AI provider required");
      expect(mockSendAIChat).not.toHaveBeenCalled();
      expect(input).toHaveValue("How am I doing?");
    });
  });

  describe("offline state", () => {
    beforeEach(() => {
      mockGetAIProvider.mockRejectedValue(new Error("Failed to fetch"));
    });

    it("shows offline message when server unreachable", async () => {
      render(<AIChatPage />);

      await waitFor(() => {
        expect(screen.getByText("Unable to Connect")).toBeInTheDocument();
      });

      expect(screen.getByText(/Cannot reach the server/)).toBeInTheDocument();
    });

    it("shows retry button", async () => {
      render(<AIChatPage />);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /retry connection/i }),
        ).toBeInTheDocument();
      });
    });

    it("retries and transitions to ready on success", async () => {
      render(<AIChatPage />);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /retry connection/i }),
        ).toBeInTheDocument();
      });

      // Now getAIProvider succeeds on retry
      mockGetAIProvider.mockResolvedValue({
        provider_type: "claude",
        status: "connected",
      });

      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: /retry connection/i }),
        );
      });

      await waitFor(() => {
        expect(screen.getByText("Start a conversation")).toBeInTheDocument();
      });
    });
  });

  describe("ready state - empty chat", () => {
    beforeEach(() => {
      mockGetAIProvider.mockResolvedValue({
        provider_type: "claude",
        status: "connected",
      });
    });

    it("uses the full page for chat without a redundant page header", async () => {
      render(<AIChatPage />);

      await waitFor(() => {
        expect(
          screen.getByRole("region", { name: "AI chat" }),
        ).toBeInTheDocument();
      });

      expect(
        screen.queryByRole("heading", { level: 1, name: "AI Chat" }),
      ).not.toBeInTheDocument();
    });

    it("shows empty state with suggestions when there is no history", async () => {
      render(<AIChatPage />);

      expect(
        await screen.findByText("Start a conversation"),
      ).toBeInTheDocument();
      expect(screen.getByText("How am I doing today?")).toBeInTheDocument();
      expect(
        screen.getByText("Why do I spike after breakfast?"),
      ).toBeInTheDocument();
    });

    it("restores the current conversation from the server", async () => {
      mockGetChatHistory.mockResolvedValue({
        messages: [
          {
            content: "Previous conversation",
            disclaimer: "Previous disclaimer",
            id: "previous-message",
            role: "assistant",
            timestamp: "2026-08-03T10:30:00.000Z",
          },
        ],
      });

      render(<AIChatPage />);

      expect(
        await screen.findByText("Previous conversation"),
      ).toBeInTheDocument();
      expect(screen.getByText("Previous disclaimer")).toBeInTheDocument();
      expect(mockGetChatHistory).toHaveBeenCalledTimes(1);
    });

    it("keeps the loading state visible until history resolves", async () => {
      let resolveHistory: (value: unknown) => void;
      mockGetChatHistory.mockReturnValue(
        new Promise((resolve) => {
          resolveHistory = resolve;
        }),
      );

      render(<AIChatPage />);

      expect(
        screen.getByRole("status", { name: "Loading conversation..." }),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Start a conversation"),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("textbox", { name: "Message input" }),
      ).toBeDisabled();

      await act(async () => {
        resolveHistory!({
          messages: [
            {
              content: "Loaded conversation",
              id: "loaded-message",
              role: "assistant",
              timestamp: "2026-08-03T10:30:00.000Z",
            },
          ],
        });
      });

      expect(screen.getByText("Loaded conversation")).toBeInTheDocument();
      expect(
        screen.queryByRole("status", { name: "Loading conversation..." }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("textbox", { name: "Message input" }),
      ).toBeEnabled();
    });

    it("keeps the empty chat usable when history cannot load", async () => {
      mockGetChatHistory.mockRejectedValue(new Error("History unavailable"));

      render(<AIChatPage />);

      expect(
        await screen.findByText("Start a conversation"),
      ).toBeInTheDocument();
      expect(mockGetChatHistory).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole("button", { name: /send message/i }),
      ).toBeInTheDocument();
    });

    it("fills input when clicking a suggestion", async () => {
      render(<AIChatPage />);

      await waitFor(() => {
        expect(screen.getByText("How am I doing today?")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText("How am I doing today?"));
      });

      const textarea = screen.getByPlaceholderText(
        "Ask about your glucose data...",
      );
      expect(textarea).toHaveValue("How am I doing today?");
    });

    it("shows disclaimer text", async () => {
      render(<AIChatPage />);

      await waitFor(() => {
        expect(
          screen.getByText(
            "Not medical advice. Consult your healthcare provider.",
          ),
        ).toBeInTheDocument();
      });
    });

    it("shows send button disabled when input is empty", async () => {
      render(<AIChatPage />);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /send message/i }),
        ).toBeDisabled();
      });
    });

    it("aligns the send button with the textarea", async () => {
      render(<AIChatPage />);

      const textarea = await screen.findByRole("textbox", {
        name: "Message input",
      });
      const sendButton = screen.getByRole("button", {
        name: /send message/i,
      });

      expect(textarea).toHaveClass("min-h-12");
      expect(textarea.parentElement).toHaveClass("gap-0");
      expect(sendButton).toHaveClass("h-12");
    });

    it("focuses the chat input with a subtle page-specific focus ring", async () => {
      render(<AIChatPage />);

      const textarea = await screen.findByRole("textbox", {
        name: "Message input",
      });

      await waitFor(() => {
        expect(textarea).toHaveFocus();
      });
      expect(textarea).toHaveClass("focus-visible:ring-1");
      expect(textarea).not.toHaveClass("focus-visible:ring-2");
    });

    it("enables send button when input has text", async () => {
      render(<AIChatPage />);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Ask about your glucose data..."),
        ).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.change(
          screen.getByPlaceholderText("Ask about your glucose data..."),
          { target: { value: "Hello" } },
        );
      });

      expect(
        screen.getByRole("button", { name: /send message/i }),
      ).not.toBeDisabled();
    });

    it("does not show clear button when no messages", async () => {
      render(<AIChatPage />);

      await waitFor(() => {
        expect(screen.getByText("Start a conversation")).toBeInTheDocument();
      });

      expect(
        screen.queryByRole("button", { name: /clear chat history/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("sending messages", () => {
    beforeEach(() => {
      mockGetAIProvider.mockResolvedValue({
        provider_type: "claude",
        status: "connected",
      });
    });

    it("sends message and shows response", async () => {
      mockSendAIChat.mockResolvedValue({
        response: "Your glucose looks stable today.",
        disclaimer: "Not medical advice. Consult your healthcare provider.",
      });

      render(<AIChatPage />);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Ask about your glucose data..."),
        ).toBeInTheDocument();
      });

      const textarea = screen.getByPlaceholderText(
        "Ask about your glucose data...",
      );

      await act(async () => {
        fireEvent.change(textarea, {
          target: { value: "How am I doing?" },
        });
      });

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /send message/i }));
      });

      // User message should appear
      await waitFor(() => {
        expect(screen.getByText("How am I doing?")).toBeInTheDocument();
      });

      // AI response should appear
      await waitFor(() => {
        expect(
          screen.getByText("Your glucose looks stable today."),
        ).toBeInTheDocument();
      });

      expect(mockSendAIChat).toHaveBeenCalledWith("How am I doing?");
    });

    it("submits only once after provider discovery and history loading finish", async () => {
      let resolveProvider: (value: unknown) => void;
      const providerRequest = new Promise((resolve) => {
        resolveProvider = resolve;
      });
      mockGetAIProvider.mockReturnValue(providerRequest);
      mockSendAIChat.mockResolvedValue({
        disclaimer: "Disclaimer",
        response: "Single response",
      });

      render(<AIChatPage />);

      const textarea = await screen.findByRole("textbox", {
        name: "Message input",
      });
      expect(textarea).toBeDisabled();
      expect(mockSendAIChat).not.toHaveBeenCalled();

      await act(async () => {
        resolveProvider!({ provider_type: "claude", status: "connected" });
      });

      await waitFor(() => {
        expect(textarea).toBeEnabled();
      });
      fireEvent.change(textarea, { target: { value: "Send this once" } });
      act(() => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      await screen.findByText("Single response");
      expect(mockSendAIChat).toHaveBeenCalledTimes(1);
      expect(mockSendAIChat).toHaveBeenCalledWith("Send this once");
    });

    it("uses compact bubbles with timestamps outside on hover", async () => {
      mockSendAIChat.mockResolvedValue({
        response: "Compact response",
        disclaimer: "Disclaimer",
      });

      render(<AIChatPage />);

      const textarea = await screen.findByRole("textbox", {
        name: "Message input",
      });
      fireEvent.change(textarea, {
        target: { value: "Compact question" },
      });
      fireEvent.click(screen.getByRole("button", { name: /send message/i }));

      const userContent = await screen.findByText("Compact question");
      const userArticle = userContent.closest("article");
      const messageGroup = userArticle?.parentElement;
      const timestamp = messageGroup?.querySelector("time");

      if (!userArticle || !messageGroup || !timestamp) {
        throw new Error("Expected the user bubble and its timestamp");
      }

      expect(userArticle).toHaveClass("px-3", "py-2");
      expect(userArticle).not.toHaveClass("px-4", "py-3");
      expect(messageGroup).toHaveClass("group", "items-end");
      expect(timestamp).not.toBeNull();
      expect(userArticle).not.toContainElement(timestamp);
      expect(timestamp).toHaveClass(
        "text-foreground-primary",
        "lg:opacity-0",
        "lg:group-hover:opacity-100",
        "lg:group-focus-within:opacity-100",
      );
      expect(timestamp).not.toHaveClass("opacity-0");
    });

    it("shows typing indicator while waiting", async () => {
      let resolveChat: (value: unknown) => void;
      mockSendAIChat.mockReturnValue(
        new Promise((resolve) => {
          resolveChat = resolve;
        }),
      );

      render(<AIChatPage />);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Ask about your glucose data..."),
        ).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.change(
          screen.getByPlaceholderText("Ask about your glucose data..."),
          { target: { value: "Test message" } },
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /send message/i }));
      });

      // Typing indicator should show
      expect(screen.getByText("AI is thinking...")).toBeInTheDocument();

      // Resolve the promise
      await act(async () => {
        resolveChat!({
          response: "Response",
          disclaimer: "Disclaimer",
        });
      });

      // Typing indicator should be gone
      expect(screen.queryByText("AI is thinking...")).not.toBeInTheDocument();
    });

    it("restores input focus after sending", async () => {
      let resolveChat: (value: unknown) => void;
      mockSendAIChat.mockReturnValue(
        new Promise((resolve) => {
          resolveChat = resolve;
        }),
      );

      render(<AIChatPage />);

      const textarea = await screen.findByRole("textbox", {
        name: "Message input",
      });
      fireEvent.change(textarea, {
        target: { value: "Keep me typing" },
      });

      const sendButton = screen.getByRole("button", {
        name: /send message/i,
      });
      sendButton.focus();
      fireEvent.click(sendButton);

      expect(textarea).toBeDisabled();
      expect(sendButton).toHaveFocus();

      await act(async () => {
        resolveChat!({
          response: "Response",
          disclaimer: "Disclaimer",
        });
      });

      await waitFor(() => {
        expect(textarea).toBeEnabled();
        expect(textarea).toHaveFocus();
      });
    });

    it("clears input after sending", async () => {
      mockSendAIChat.mockResolvedValue({
        response: "Reply",
        disclaimer: "Disclaimer",
      });

      render(<AIChatPage />);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Ask about your glucose data..."),
        ).toBeInTheDocument();
      });

      const textarea = screen.getByPlaceholderText(
        "Ask about your glucose data...",
      );

      await act(async () => {
        fireEvent.change(textarea, {
          target: { value: "My question" },
        });
      });

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /send message/i }));
      });

      // Input should be cleared immediately
      expect(textarea).toHaveValue("");
    });

    it("sends on Enter key (without shift)", async () => {
      mockSendAIChat.mockResolvedValue({
        response: "Reply",
        disclaimer: "Disclaimer",
      });

      render(<AIChatPage />);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Ask about your glucose data..."),
        ).toBeInTheDocument();
      });

      const textarea = screen.getByPlaceholderText(
        "Ask about your glucose data...",
      );

      await act(async () => {
        fireEvent.change(textarea, {
          target: { value: "Enter test" },
        });
      });

      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      });

      expect(mockSendAIChat).toHaveBeenCalledWith("Enter test");
    });

    it("does NOT send on Shift+Enter", async () => {
      render(<AIChatPage />);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Ask about your glucose data..."),
        ).toBeInTheDocument();
      });

      const textarea = screen.getByPlaceholderText(
        "Ask about your glucose data...",
      );

      await act(async () => {
        fireEvent.change(textarea, {
          target: { value: "Multi-line" },
        });
      });

      await act(async () => {
        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
      });

      expect(mockSendAIChat).not.toHaveBeenCalled();
    });

    it("does not send while Enter confirms an IME composition", async () => {
      render(<AIChatPage />);

      const textarea = await screen.findByRole("textbox", {
        name: "Message input",
      });
      fireEvent.change(textarea, { target: { value: "入力中" } });
      fireEvent.keyDown(textarea, {
        isComposing: true,
        key: "Enter",
        shiftKey: false,
      });

      expect(mockSendAIChat).not.toHaveBeenCalled();
      expect(textarea).toHaveValue("入力中");
    });

    it("shows error on send failure", async () => {
      mockSendAIChat.mockRejectedValue(
        new Error("Unable to get a response from the AI provider"),
      );

      render(<AIChatPage />);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Ask about your glucose data..."),
        ).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.change(
          screen.getByPlaceholderText("Ask about your glucose data..."),
          { target: { value: "Failing message" } },
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /send message/i }));
      });

      await waitFor(() => {
        expect(
          screen.getByText("Unable to get a response from the AI provider"),
        ).toBeInTheDocument();
      });
    });

    it("shows provider information when sending reports a missing provider", async () => {
      mockSendAIChat.mockRejectedValue(new Error("No AI provider configured"));

      render(<AIChatPage />);

      const input = await screen.findByRole("textbox", {
        name: "Message input",
      });

      fireEvent.change(input, {
        target: { value: "How are my readings?" },
      });
      fireEvent.click(screen.getByRole("button", { name: /send message/i }));

      const providerAlert = await screen.findByRole("alert");
      expect(providerAlert).toHaveTextContent("AI provider required");
      expect(
        within(providerAlert).getByRole("link", {
          name: "Configure AI provider",
        }),
      ).toHaveAttribute("href", "/settings/ai");
      expect(input).toHaveValue("How are my readings?");
      expect(screen.queryByRole("article")).not.toBeInTheDocument();
    });

    it("shows disclaimer on AI response", async () => {
      mockSendAIChat.mockResolvedValue({
        response: "Your readings look good.",
        disclaimer: "Not medical advice. Consult your healthcare provider.",
      });

      render(<AIChatPage />);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Ask about your glucose data..."),
        ).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.change(
          screen.getByPlaceholderText("Ask about your glucose data..."),
          { target: { value: "How are my readings?" } },
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /send message/i }));
      });

      // After sending, the disclaimer should appear on the AI response
      // (in addition to the static disclaimer bar already present)
      await waitFor(() => {
        const disclaimers = screen.getAllByText(
          "Not medical advice. Consult your healthcare provider.",
        );
        // One from the static bar, one from the AI response bubble
        expect(disclaimers.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe("clear chat", () => {
    beforeEach(() => {
      jest.spyOn(window, "confirm").mockReturnValue(true);
      mockGetAIProvider.mockResolvedValue({
        provider_type: "claude",
        status: "connected",
      });
      mockSendAIChat.mockResolvedValue({
        response: "Response text",
        disclaimer: "Disclaimer",
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("places clear beside send after messages exist", async () => {
      render(<AIChatPage />);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Ask about your glucose data..."),
        ).toBeInTheDocument();
      });

      // Send a message first
      await act(async () => {
        fireEvent.change(
          screen.getByPlaceholderText("Ask about your glucose data..."),
          { target: { value: "Test" } },
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /send message/i }));
      });

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /clear chat history/i }),
        ).toBeInTheDocument();
      });

      const chatControls = screen.getByRole("group", {
        name: "Chat controls",
      });

      expect(
        within(chatControls).getByRole("button", {
          name: /clear chat history/i,
        }),
      ).toBeInTheDocument();
      expect(
        within(chatControls).getByRole("button", { name: /send message/i }),
      ).toBeInTheDocument();
    });

    it("clears all messages when clear is clicked", async () => {
      render(<AIChatPage />);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Ask about your glucose data..."),
        ).toBeInTheDocument();
      });

      // Send a message
      await act(async () => {
        fireEvent.change(
          screen.getByPlaceholderText("Ask about your glucose data..."),
          { target: { value: "Test" } },
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /send message/i }));
      });

      await waitFor(() => {
        expect(screen.getByText("Response text")).toBeInTheDocument();
      });

      // Clear chat
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: /clear chat history/i }),
        );
      });

      expect(mockConfirm).toHaveBeenCalledWith({
        confirmLabel: "Clear conversation",
        description:
          "This cannot be undone. Every message in this conversation will be permanently removed.",
        title: "Clear this conversation?",
        tone: "destructive",
      });
      // Messages should be gone, empty state should return
      expect(screen.queryByText("Test")).not.toBeInTheDocument();
      expect(screen.queryByText("Response text")).not.toBeInTheDocument();
      expect(screen.getByText("Start a conversation")).toBeInTheDocument();
    });

    it("keeps the transcript when clearing is cancelled", async () => {
      mockConfirm.mockResolvedValue(false);
      render(<AIChatPage />);

      const textarea = await screen.findByRole("textbox", {
        name: "Message input",
      });
      fireEvent.change(textarea, { target: { value: "Keep this message" } });
      fireEvent.click(screen.getByRole("button", { name: /send message/i }));
      expect(await screen.findByText("Response text")).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole("button", { name: /clear chat history/i }),
      );

      await waitFor(() => {
        expect(mockClearChatHistory).not.toHaveBeenCalled();
      });
      expect(screen.getByText("Keep this message")).toBeVisible();
      expect(screen.getByText("Response text")).toBeVisible();
    });

    it("keeps the transcript and reports a failed server clear", async () => {
      mockClearChatHistory.mockRejectedValue(new Error("Clear request failed"));
      render(<AIChatPage />);

      const textarea = await screen.findByRole("textbox", {
        name: "Message input",
      });
      fireEvent.change(textarea, { target: { value: "Keep this message" } });
      fireEvent.click(screen.getByRole("button", { name: /send message/i }));
      expect(await screen.findByText("Response text")).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole("button", { name: /clear chat history/i }),
      );

      expect(
        await screen.findByText("Clear request failed"),
      ).toBeInTheDocument();
      expect(screen.getByText("Keep this message")).toBeInTheDocument();
      expect(screen.getByText("Response text")).toBeInTheDocument();
    });

    it("disables clearing while a response is pending", async () => {
      let resolveChat: (value: unknown) => void;
      mockSendAIChat.mockReturnValue(
        new Promise((resolve) => {
          resolveChat = resolve;
        }),
      );

      render(<AIChatPage />);

      const textarea = await screen.findByRole("textbox", {
        name: "Message input",
      });
      fireEvent.change(textarea, { target: { value: "Pending question" } });
      fireEvent.click(screen.getByRole("button", { name: /send message/i }));

      const clearButton = await screen.findByRole("button", {
        name: /clear chat history/i,
      });
      expect(clearButton).toBeDisabled();
      fireEvent.click(clearButton);
      expect(mockClearChatHistory).not.toHaveBeenCalled();

      await act(async () => {
        resolveChat!({ disclaimer: "Disclaimer", response: "Response" });
      });

      expect(clearButton).toBeEnabled();
    });
  });

  describe("multiple messages", () => {
    beforeEach(() => {
      mockGetAIProvider.mockResolvedValue({
        provider_type: "claude",
        status: "connected",
      });
    });

    it("supports multiple exchanges in sequence", async () => {
      mockSendAIChat
        .mockResolvedValueOnce({
          response: "First reply",
          disclaimer: "Disclaimer",
        })
        .mockResolvedValueOnce({
          response: "Second reply",
          disclaimer: "Disclaimer",
        });

      render(<AIChatPage />);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Ask about your glucose data..."),
        ).toBeInTheDocument();
      });

      // Send first message
      await act(async () => {
        fireEvent.change(
          screen.getByPlaceholderText("Ask about your glucose data..."),
          { target: { value: "First question" } },
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /send message/i }));
      });

      await waitFor(() => {
        expect(screen.getByText("First reply")).toBeInTheDocument();
      });

      // Send second message
      await act(async () => {
        fireEvent.change(
          screen.getByPlaceholderText("Ask about your glucose data..."),
          { target: { value: "Second question" } },
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /send message/i }));
      });

      await waitFor(() => {
        expect(screen.getByText("Second reply")).toBeInTheDocument();
      });

      // Both exchanges should be visible
      expect(screen.getByText("First question")).toBeInTheDocument();
      expect(screen.getByText("First reply")).toBeInTheDocument();
      expect(screen.getByText("Second question")).toBeInTheDocument();
      expect(screen.getByText("Second reply")).toBeInTheDocument();
    });
  });

  describe("does not send empty messages", () => {
    beforeEach(() => {
      mockGetAIProvider.mockResolvedValue({
        provider_type: "claude",
        status: "connected",
      });
    });

    it("does not send whitespace-only input", async () => {
      render(<AIChatPage />);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Ask about your glucose data..."),
        ).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.change(
          screen.getByPlaceholderText("Ask about your glucose data..."),
          { target: { value: "   " } },
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /send message/i }));
      });

      expect(mockSendAIChat).not.toHaveBeenCalled();
    });
  });

  describe("accessibility", () => {
    beforeEach(() => {
      mockGetAIProvider.mockResolvedValue({
        provider_type: "claude",
        status: "connected",
      });
    });

    it("has role=log on messages area", async () => {
      render(<AIChatPage />);

      await waitFor(() => {
        expect(screen.getByRole("log")).toBeInTheDocument();
      });
    });

    it("keeps page overflow fixed and scrolls only the message area", async () => {
      render(<AIChatPage />);

      const messageLog = await screen.findByRole("log");
      const chatRegion = screen.getByRole("region", { name: "AI chat" });
      const contentPage = chatRegion.parentElement;
      const pageTransition = contentPage?.parentElement;

      expect(messageLog).toHaveClass(
        "min-h-0",
        "flex-1",
        "overflow-y-auto",
        "overscroll-contain",
        "[scrollbar-width:none]",
        "[&::-webkit-scrollbar]:hidden",
      );
      expect(chatRegion).toHaveClass("min-h-0", "flex-1", "overflow-hidden");
      expect(contentPage).toHaveClass("h-full", "min-h-0", "space-y-0", "py-0");
      expect(pageTransition).toHaveClass(
        "h-full",
        "min-h-0",
        "overflow-hidden",
      );
    });

    it("has aria-label on message input", async () => {
      render(<AIChatPage />);

      await waitFor(() => {
        expect(screen.getByLabelText("Message input")).toBeInTheDocument();
      });
    });

    it("has maxLength on textarea", async () => {
      render(<AIChatPage />);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Ask about your glucose data..."),
        ).toHaveAttribute("maxLength", "2000");
      });
    });

    it("shows typing indicator with role=status", async () => {
      mockSendAIChat.mockReturnValue(new Promise(() => {}));

      render(<AIChatPage />);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Ask about your glucose data..."),
        ).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.change(
          screen.getByPlaceholderText("Ask about your glucose data..."),
          { target: { value: "Test" } },
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /send message/i }));
      });

      expect(
        screen.getByRole("status", { name: "AI is thinking..." }),
      ).toBeInTheDocument();
    });
  });

  describe("error recovery", () => {
    beforeEach(() => {
      mockGetAIProvider.mockResolvedValue({
        provider_type: "claude",
        status: "connected",
      });
    });

    it("clears error on next successful send", async () => {
      // First send fails
      mockSendAIChat.mockRejectedValueOnce(new Error("AI provider error"));

      render(<AIChatPage />);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Ask about your glucose data..."),
        ).toBeInTheDocument();
      });

      // Send failing message
      await act(async () => {
        fireEvent.change(
          screen.getByPlaceholderText("Ask about your glucose data..."),
          { target: { value: "Failing message" } },
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /send message/i }));
      });

      await waitFor(() => {
        expect(screen.getByText("AI provider error")).toBeInTheDocument();
      });

      // Second send succeeds
      mockSendAIChat.mockResolvedValueOnce({
        response: "Success!",
        disclaimer: "Disclaimer",
      });

      await act(async () => {
        fireEvent.change(
          screen.getByPlaceholderText("Ask about your glucose data..."),
          { target: { value: "Working message" } },
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /send message/i }));
      });

      await waitFor(() => {
        expect(screen.getByText("Success!")).toBeInTheDocument();
      });

      // Error should be cleared
      expect(screen.queryByText("AI provider error")).not.toBeInTheDocument();
    });
  });
});
