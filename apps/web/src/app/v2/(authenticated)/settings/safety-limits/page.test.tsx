import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import {
  getSafetyLimits,
  getSafetyLimitsDefaults,
  updateSafetyLimits,
} from "@/lib/api";
import { useUserContext } from "@/providers/user-provider";

import SafetyLimitsPage from "./page";

jest.mock("@/lib/api", () => ({
  getSafetyLimits: jest.fn(),
  getSafetyLimitsDefaults: jest.fn(),
  updateSafetyLimits: jest.fn(),
}));

jest.mock("@/providers/user-provider", () => ({
  useUserContext: jest.fn(),
}));

const mockGetSafetyLimits = jest.mocked(getSafetyLimits);
const mockGetSafetyLimitsDefaults = jest.mocked(getSafetyLimitsDefaults);
const mockUpdateSafetyLimits = jest.mocked(updateSafetyLimits);
const mockUseUserContext = jest.mocked(useUserContext);

const LIMITS = {
  id: "limits-1",
  max_basal_rate_milliunits: 15000,
  max_bolus_dose_milliunits: 25000,
  max_glucose_mgdl: 500,
  min_glucose_mgdl: 20,
  updated_at: "2026-08-03T10:00:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSafetyLimits.mockResolvedValue(LIMITS);
  mockGetSafetyLimitsDefaults.mockResolvedValue({
    max_basal_rate_milliunits: 15000,
    max_bolus_dose_milliunits: 25000,
    max_glucose_mgdl: 500,
    min_glucose_mgdl: 20,
  });
  mockUseUserContext.mockReturnValue({
    error: null,
    isLoading: false,
    refreshUser: jest.fn(),
    user: {
      created_at: "2026-01-01T00:00:00.000Z",
      disclaimer_acknowledged: true,
      disclaimer_version: "2026-01",
      display_name: "Daniel",
      email: "daniel@example.com",
      email_verified: true,
      glucose_unit: "mgdl",
      id: "user-1",
      is_active: true,
      meal_intelligence_enabled: true,
      role: "diabetic",
    },
  });
});

describe("SafetyLimitsPage", () => {
  it("keeps inline confirmation nonmodal and restores trigger focus on cancel", async () => {
    render(<SafetyLimitsPage />);

    const minGlucose = await screen.findByLabelText("Minimum Glucose (mg/dL)");
    fireEvent.change(minGlucose, { target: { value: "25" } });

    const saveButton = screen.getByRole("button", { name: "Save Changes" });
    saveButton.focus();
    fireEvent.click(saveButton);

    const confirmation = await screen.findByRole("alertdialog", {
      name: "Confirm safety limits change",
    });
    expect(confirmation).not.toHaveAttribute("aria-modal");

    fireEvent.click(
      within(confirmation).getByRole("button", { name: "Cancel" }),
    );

    await waitFor(() => {
      expect(saveButton).toHaveFocus();
    });
    expect(mockUpdateSafetyLimits).not.toHaveBeenCalled();
  });
});
