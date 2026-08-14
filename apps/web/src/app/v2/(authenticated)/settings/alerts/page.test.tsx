import { render, screen, waitFor } from "@testing-library/react";
import { getAlertThresholds, getEscalationConfig } from "@/lib/api";
import AlertSettingsPage from "./page";

const mockRouterReplace = jest.fn();
const mockRouter = { replace: mockRouterReplace };

jest.mock("next/navigation", () => ({
  usePathname: () => "/settings/alarms-notification",
  useRouter: () => mockRouter,
}));

jest.mock("@/hooks/use-glucose-unit", () => ({
  useGlucoseUnit: () => "mgdl",
}));

jest.mock("@/lib/api", () => ({
  getAlertThresholds: jest.fn(),
  getEscalationConfig: jest.fn(),
  updateAlertThresholds: jest.fn(),
  updateEscalationConfig: jest.fn(),
}));

const mockGetAlertThresholds = jest.mocked(getAlertThresholds);
const mockGetEscalationConfig = jest.mocked(getEscalationConfig);

describe("AlertSettingsPage session handling", () => {
  it("redirects instead of applying defaults after a 401", async () => {
    mockGetAlertThresholds.mockRejectedValue(new Error("401: Session expired"));
    mockGetEscalationConfig.mockResolvedValue({
      all_contacts_delay_minutes: 20,
      id: "escalation-1",
      primary_contact_delay_minutes: 10,
      reminder_delay_minutes: 5,
      updated_at: "2026-08-01T10:00:00.000Z",
    });

    render(<AlertSettingsPage />);

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith(
        "/login?expired=true&redirect=%2Fsettings%2Falarms-notification",
      );
    });
  });

  it("does not show fabricated thresholds when the server is unavailable", async () => {
    mockGetAlertThresholds.mockRejectedValue(new Error("Network unavailable"));
    mockGetEscalationConfig.mockRejectedValue(new Error("Network unavailable"));

    render(<AlertSettingsPage />);

    expect(
      await screen.findByText(
        "Unable to connect to server. Alert settings are unavailable.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/urgent low/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /save changes/i }),
    ).not.toBeInTheDocument();
  });
});
