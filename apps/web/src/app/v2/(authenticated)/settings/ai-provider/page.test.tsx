import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import {
  deleteAIProvider,
  getAIProvider,
  getSidecarHealth,
  getSubscriptionAuthStatus,
  revokeSubscriptionAuth,
} from "@/lib/api";

import AIProviderPage from "./page";

jest.mock("@/lib/api", () => ({
  configureAIProvider: jest.fn(),
  configureSubscriptionProvider: jest.fn(),
  deleteAIProvider: jest.fn(),
  getAIProvider: jest.fn(),
  getSidecarHealth: jest.fn(),
  getSubscriptionAuthStatus: jest.fn(),
  revokeSubscriptionAuth: jest.fn(),
  startSubscriptionAuth: jest.fn(),
  submitSubscriptionToken: jest.fn(),
  testAIProvider: jest.fn(),
}));

const mockDeleteAIProvider = jest.mocked(deleteAIProvider);
const mockGetAIProvider = jest.mocked(getAIProvider);
const mockGetSidecarHealth = jest.mocked(getSidecarHealth);
const mockGetSubscriptionAuthStatus = jest.mocked(getSubscriptionAuthStatus);
const mockRevokeSubscriptionAuth = jest.mocked(revokeSubscriptionAuth);

const CONFIG = {
  base_url: null,
  created_at: "2026-08-01T10:00:00.000Z",
  last_error: null,
  last_validated_at: "2026-08-01T10:05:00.000Z",
  masked_api_key: "sidecar-managed",
  max_response_tokens: null,
  model_name: null,
  provider_type: "claude_subscription" as const,
  sidecar_provider: "claude" as const,
  status: "connected" as const,
  updated_at: "2026-08-01T10:05:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAIProvider.mockResolvedValue(CONFIG);
  mockGetSidecarHealth.mockResolvedValue({ available: true, status: "ok" });
  mockGetSubscriptionAuthStatus.mockResolvedValue({
    claude: { authenticated: true },
    sidecar_available: true,
  });
  mockRevokeSubscriptionAuth.mockResolvedValue();
  mockDeleteAIProvider.mockResolvedValue({ message: "Provider removed" });
});

describe("AIProviderPage", () => {
  it("preserves the configured provider when cleanup fails after revocation", async () => {
    mockDeleteAIProvider.mockRejectedValue(new Error("Delete failed"));
    render(<AIProviderPage />);

    expect(
      await screen.findByRole("heading", { name: "Current Configuration" }),
    ).toBeVisible();
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(
      await screen.findByText(
        "Failed to remove provider configuration. Use 'Remove AI Provider' to clean up.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Current Configuration" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Remove AI provider" }),
    ).toBeVisible();
  });

  it("reports an unavailable sidecar after the health check fails", async () => {
    mockGetAIProvider.mockRejectedValue(new Error("404: Not configured"));
    mockGetSidecarHealth.mockRejectedValue(new Error("Sidecar unavailable"));
    mockGetSubscriptionAuthStatus.mockRejectedValue(
      new Error("Sidecar unavailable"),
    );
    render(<AIProviderPage />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Select Claude Subscription",
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Unavailable")).toBeVisible();
      expect(screen.queryByText("Checking...")).not.toBeInTheDocument();
    });
  });
});
