import { fireEvent, render, screen } from "@testing-library/react";
import {
  getBriefDeliveryConfig,
  type BriefDeliveryConfigResponse,
} from "@/lib/api";
import BriefDeliveryPage from "./page";

const mockRouter = { replace: jest.fn() };

jest.mock("next/navigation", () => ({
  usePathname: () => "/settings/alarms-notification",
  useRouter: () => mockRouter,
}));

jest.mock("@/lib/api", () => ({
  getBriefDeliveryConfig: jest.fn(),
  updateBriefDeliveryConfig: jest.fn(),
}));

const mockGetBriefDeliveryConfig = jest.mocked(getBriefDeliveryConfig);

const CONFIG: BriefDeliveryConfigResponse = {
  channel: "both",
  delivery_time: "07:00:30",
  enabled: true,
  id: "brief-config-1",
  timezone: "UTC",
  updated_at: "2026-08-01T10:00:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("BriefDeliveryPage", () => {
  it("normalizes server seconds when detecting changes", async () => {
    mockGetBriefDeliveryConfig.mockResolvedValue(CONFIG);

    render(<BriefDeliveryPage />);

    expect(
      await screen.findByRole("button", { name: "Save Changes" }),
    ).toBeDisabled();
  });

  it("shows pending feedback while retrying a failed load", async () => {
    mockGetBriefDeliveryConfig.mockRejectedValueOnce(
      new Error("Network unavailable"),
    );
    mockGetBriefDeliveryConfig.mockReturnValueOnce(
      new Promise(() => undefined),
    );

    render(<BriefDeliveryPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Retry connection" }),
    );

    expect(
      screen.getByRole("status", {
        name: "Loading delivery configuration...",
      }),
    ).toBeVisible();
    expect(mockGetBriefDeliveryConfig).toHaveBeenCalledTimes(2);
  });
});
