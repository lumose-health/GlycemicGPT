import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AlertSettingsPage from "@/app/v2/(authenticated)/settings/alerts/page";
import {
  getAlertThresholds,
  getEscalationConfig,
  updateAlertThresholds,
  updateEscalationConfig,
} from "@/lib/api";

const mockRouter = { replace: jest.fn() };

jest.mock("next/navigation", () => ({
  usePathname: () => "/settings/alarms-notification",
  useRouter: () => mockRouter,
}));

jest.mock("@/lib/api");

jest.mock("@/hooks/use-glucose-unit", () => ({
  useGlucoseUnit: () => "mgdl",
}));

const mockGetAlertThresholds = getAlertThresholds as jest.MockedFunction<
  typeof getAlertThresholds
>;
const mockGetEscalationConfig = getEscalationConfig as jest.MockedFunction<
  typeof getEscalationConfig
>;
const mockUpdateAlertThresholds = updateAlertThresholds as jest.MockedFunction<
  typeof updateAlertThresholds
>;
const mockUpdateEscalationConfig =
  updateEscalationConfig as jest.MockedFunction<typeof updateEscalationConfig>;

describe("V2 alert settings reset", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAlertThresholds.mockResolvedValue({
      high_warning: 190,
      id: "thresholds-1",
      iob_warning: 4,
      low_warning: 75,
      urgent_high: 260,
      urgent_low: 60,
      updated_at: "2026-08-02T10:00:00.000Z",
    });
    mockGetEscalationConfig.mockResolvedValue({
      all_contacts_delay_minutes: 30,
      id: "escalation-1",
      primary_contact_delay_minutes: 15,
      reminder_delay_minutes: 8,
      updated_at: "2026-08-02T10:00:00.000Z",
    });
  });

  it("applies the successful half of a partial reset", async () => {
    mockUpdateAlertThresholds.mockResolvedValue({
      high_warning: 180,
      id: "thresholds-1",
      iob_warning: 3,
      low_warning: 70,
      urgent_high: 250,
      urgent_low: 55,
      updated_at: "2026-08-02T10:01:00.000Z",
    });
    mockUpdateEscalationConfig.mockRejectedValue(
      new Error("Escalation reset failed"),
    );

    render(<AlertSettingsPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Reset to Defaults" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Escalation reset failed",
    );
    await waitFor(() => {
      expect(screen.getByLabelText(/Urgent Low/)).toHaveValue(55);
      expect(screen.getByLabelText(/Reminder/)).toHaveValue(8);
    });
    expect(mockUpdateAlertThresholds).toHaveBeenCalledTimes(1);
    expect(mockUpdateEscalationConfig).toHaveBeenCalledTimes(1);
  });
});
