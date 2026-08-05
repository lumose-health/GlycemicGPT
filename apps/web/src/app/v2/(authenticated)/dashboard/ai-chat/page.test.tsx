import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getAIProvider, getChatHistory, sendAIChat } from "@/lib/api";
import AIChatPage from "./page";

const mockRouterReplace = jest.fn();
const mockRouter = { replace: mockRouterReplace };

jest.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/ai-chat",
  useRouter: () => mockRouter,
}));

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

describe("AIChatPage session handling", () => {
  it("redirects when the provider check reports an expired session", async () => {
    mockGetAIProvider.mockRejectedValue(new Error("401: Session expired"));

    render(<AIChatPage />);

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith(
        "/login?expired=true&redirect=%2Fdashboard%2Fai-chat",
      );
    });
  });

  it("redirects when supplementary history reports an expired session", async () => {
    mockGetChatHistory.mockRejectedValue(new Error("401: Session expired"));

    render(<AIChatPage />);

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith(
        "/login?expired=true&redirect=%2Fdashboard%2Fai-chat",
      );
    });
  });

  it("redirects when sending a message reports an expired session", async () => {
    mockSendAIChat.mockRejectedValue(new Error("401: Session expired"));

    render(<AIChatPage />);
    fireEvent.change(await screen.findByLabelText("Message input"), {
      target: { value: "How am I doing?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith(
        "/login?expired=true&redirect=%2Fdashboard%2Fai-chat",
      );
    });
  });
});
