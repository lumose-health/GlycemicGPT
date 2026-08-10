import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  generateTelegramCode,
  getTelegramBotConfig,
  getTelegramStatus,
} from "@/lib/api";
import TelegramSettingsPage from "./page";

const mockRouterReplace = jest.fn();
const mockRouter = { replace: mockRouterReplace };

jest.mock("next/navigation", () => ({
  usePathname: () => "/settings/alarms-notification",
  useRouter: () => mockRouter,
}));

jest.mock("@/lib/api", () => ({
  generateTelegramCode: jest.fn(),
  getTelegramBotConfig: jest.fn(),
  getTelegramStatus: jest.fn(),
  removeTelegramBotToken: jest.fn(),
  saveTelegramBotToken: jest.fn(),
  sendTelegramTestMessage: jest.fn(),
  unlinkTelegram: jest.fn(),
}));

const mockGetTelegramBotConfig = jest.mocked(getTelegramBotConfig);
const mockGetTelegramStatus = jest.mocked(getTelegramStatus);
const mockGenerateTelegramCode = jest.mocked(generateTelegramCode);

describe("TelegramSettingsPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("redirects instead of showing an unlinked state after a 401", async () => {
    mockGetTelegramBotConfig.mockResolvedValue({
      bot_username: null,
      configured: false,
      configured_at: null,
    });
    mockGetTelegramStatus.mockRejectedValue(new Error("401: Session expired"));

    render(<TelegramSettingsPage />);

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith(
        "/login?expired=true&redirect=%2Fsettings%2Falarms-notification",
      );
    });
  });

  it("does not install countdown or polling intervals for an expired code", async () => {
    jest.useFakeTimers();
    mockGetTelegramBotConfig.mockResolvedValue({
      bot_username: "lumose_bot",
      configured: true,
      configured_at: "2026-08-01T10:00:00.000Z",
    });
    mockGetTelegramStatus.mockResolvedValue({
      bot_username: "lumose_bot",
      link: null,
      linked: false,
    });
    mockGenerateTelegramCode.mockResolvedValue({
      bot_username: "lumose_bot",
      code: "EXPIRED",
      expires_at: new Date(Date.now() - 1_000).toISOString(),
    });

    render(<TelegramSettingsPage />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: /generate verification code/i,
      }),
    );

    expect(
      await screen.findByText(
        "Verification code expired. Please generate a new one.",
      ),
    ).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(3_000);
    });
    expect(mockGetTelegramStatus).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
