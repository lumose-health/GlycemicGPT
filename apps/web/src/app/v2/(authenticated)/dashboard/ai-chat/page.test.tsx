import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getAIProvider, getChatHistory, sendAIChat } from "@/lib/api";
import AIChatPage from "./page";

jest.mock("@/compositions/ConfirmationProvider", () => ({
  useConfirmation: () => ({ confirm: jest.fn() }),
}));

jest.mock("@/lib/api", () => ({
  clearChatHistory: jest.fn(),
  getAIProvider: jest.fn(),
  getChatHistory: jest.fn(),
  sendAIChat: jest.fn(),
}));

const mockGetAIProvider = jest.mocked(getAIProvider);
const mockGetChatHistory = jest.mocked(getChatHistory);
const mockSendAIChat = jest.mocked(sendAIChat);

const PROVIDER = {
  base_url: null,
  created_at: "2026-08-01T10:00:00.000Z",
  last_error: null,
  last_validated_at: null,
  masked_api_key: "configured",
  max_response_tokens: null,
  model_name: "model",
  provider_type: "openai_api" as const,
  sidecar_provider: null,
  status: "connected" as const,
  updated_at: "2026-08-01T10:00:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAIProvider.mockResolvedValue(PROVIDER);
  mockGetChatHistory.mockResolvedValue({
    conversation_id: null,
    messages: [],
    total: 0,
  });
});

describe("AIChatPage request failures", () => {
  it("shows the offline state when the provider request fails", async () => {
    mockGetAIProvider.mockRejectedValue(new Error("Network unavailable"));

    render(<AIChatPage />);

    expect(
      await screen.findByRole("heading", { name: "Unable to Connect" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Retry Connection" }),
    ).toBeInTheDocument();
  });

  it("keeps chat usable when supplementary history fails", async () => {
    mockGetChatHistory.mockRejectedValue(new Error("History unavailable"));

    render(<AIChatPage />);

    await waitFor(() => {
      expect(screen.getByLabelText("Message input")).toBeEnabled();
    });
    expect(screen.getByText("Start a conversation")).toBeInTheDocument();
  });

  it("shows an ordinary send failure in the conversation", async () => {
    mockSendAIChat.mockRejectedValue(new Error("Provider unavailable"));

    render(<AIChatPage />);
    fireEvent.change(await screen.findByLabelText("Message input"), {
      target: { value: "How am I doing?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("Provider unavailable")).toBeInTheDocument();
    await waitFor(() => expect(mockSendAIChat).toHaveBeenCalledTimes(1));
  });
});
