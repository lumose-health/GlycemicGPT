import { render, waitFor } from "@testing-library/react";
import { getTelegramBotConfig, getTelegramStatus } from "@/lib/api";
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

describe("TelegramSettingsPage session handling", () => {
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
});
