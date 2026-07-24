import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  changePassword,
  getCurrentUser,
  updateGlucoseUnit,
  updateMealIntelligence,
  updateProfile,
  type CurrentUserResponse,
} from "@/lib/api";
import { useUserContext } from "@/providers";
import { ProfileSettings } from "./ProfileSettings";
import ProfilePage from "./page";

jest.mock("@/lib/api", () => ({
  changePassword: jest.fn(),
  getCurrentUser: jest.fn(),
  updateGlucoseUnit: jest.fn(),
  updateMealIntelligence: jest.fn(),
  updateProfile: jest.fn(),
}));

jest.mock("@/providers", () => ({
  useUserContext: jest.fn(),
}));

const mockChangePassword = changePassword as jest.MockedFunction<
  typeof changePassword
>;
const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<
  typeof getCurrentUser
>;
const mockUpdateGlucoseUnit = updateGlucoseUnit as jest.MockedFunction<
  typeof updateGlucoseUnit
>;
const mockUpdateMealIntelligence =
  updateMealIntelligence as jest.MockedFunction<
    typeof updateMealIntelligence
  >;
const mockUpdateProfile = updateProfile as jest.MockedFunction<
  typeof updateProfile
>;
const mockUseUserContext = useUserContext as jest.MockedFunction<
  typeof useUserContext
>;

const PROFILE: CurrentUserResponse = {
  created_at: "2025-04-18T10:00:00.000Z",
  disclaimer_acknowledged: true,
  disclaimer_version: "2025-01",
  display_name: "Daniel",
  email: "daniel@example.com",
  email_verified: true,
  glucose_unit: "mgdl",
  id: "user-1",
  is_active: true,
  meal_intelligence_enabled: true,
  role: "diabetic",
};

const refreshUser = jest.fn();

async function renderLoadedProfile() {
  render(<ProfilePage />);
  await screen.findByText(PROFILE.email);
}

async function renderLoadedPreference(section: "glucose" | "meal") {
  render(<ProfileSettings sections={[section]} />);
  if (section === "glucose") {
    await screen.findByRole("combobox", { name: "Glucose display unit" });
  } else {
    await screen.findByRole("switch");
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue(PROFILE);
  mockUpdateGlucoseUnit.mockResolvedValue({ glucose_unit: "mmol" });
  mockUpdateMealIntelligence.mockResolvedValue({ enabled: false });
  mockChangePassword.mockResolvedValue({ message: "Password changed" });
  mockUseUserContext.mockReturnValue({
    error: null,
    isLoading: false,
    refreshUser,
    user: PROFILE,
  });
});

describe("ProfilePage", () => {
  it("announces loading while the profile request is pending", () => {
    mockGetCurrentUser.mockReturnValue(new Promise(() => undefined));

    render(<ProfilePage />);

    expect(
      screen.getByRole("status", { name: "Loading profile" }),
    ).toHaveTextContent("Loading profile...");
  });

  it("loads and renders the current account details", async () => {
    await renderLoadedProfile();

    expect(mockGetCurrentUser).toHaveBeenCalledTimes(1);
    const accountHeading = screen.getByRole("heading", {
      level: 1,
      name: "Account",
    });
    const accountIcon = accountHeading
      .closest("header")
      ?.querySelector('use[href="/static_assets/iconSprite.svg#person"]')
      ?.closest("svg");

    expect(accountIcon).toHaveClass("h-20", "w-20", "text-accent");
    expect(accountIcon).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Diabetic")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Display Name/)).toHaveValue("Daniel");
    expect(
      screen.queryByRole("combobox", { name: "Glucose display unit" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: "Preferences" }),
    ).not.toBeInTheDocument();

    const accountDetails = screen.getByText(PROFILE.email).closest("dl");
    expect(accountDetails?.parentElement).toHaveClass(
      "rounded-panel",
      "bg-surface-elevated",
      "p-6",
    );
    expect(
      screen.queryByRole("heading", { level: 2, name: "Account Information" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("These account details cannot be changed here."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Set a name to personalize your experience."),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Email")).toHaveClass("text-foreground-primary");

    for (const sectionName of [
      "Personal Information",
      "Password",
    ]) {
      expect(screen.getByRole("region", { name: sectionName })).toHaveClass(
        "before:border-t",
        "before:border-border-default",
      );
    }
  });

  it("saves a trimmed display name with the existing profile payload", async () => {
    mockUpdateProfile.mockResolvedValue({ ...PROFILE, display_name: "Dani" });
    await renderLoadedProfile();

    fireEvent.change(screen.getByLabelText(/^Display Name/), {
      target: { value: "  Dani  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({ display_name: "Dani" });
    });
    expect(
      await screen.findByText("Display name updated successfully"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Display Name/)).toHaveValue("Dani");
  });

  it("shows save failures as accessible error feedback", async () => {
    mockUpdateProfile.mockRejectedValue(new Error("Display name is unavailable"));
    await renderLoadedProfile();

    fireEvent.change(screen.getByLabelText(/^Display Name/), {
      target: { value: "Taken" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not saveDisplay name is unavailable",
    );
  });

  it("saves glucose unit changes immediately and refreshes user context", async () => {
    await renderLoadedPreference("glucose");

    fireEvent.change(
      screen.getByRole("combobox", { name: "Glucose display unit" }),
      { target: { value: "mmol" } },
    );

    await waitFor(() => {
      expect(mockUpdateGlucoseUnit).toHaveBeenCalledWith("mmol");
      expect(refreshUser).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.getByRole("combobox", { name: "Glucose display unit" }),
    ).toHaveValue("mmol");
    expect(screen.getByText("Glucose unit set to mmol/L")).toBeInTheDocument();
  });

  it("saves Meal Intelligence changes immediately and refreshes user context", async () => {
    await renderLoadedPreference("meal");

    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => {
      expect(mockUpdateMealIntelligence).toHaveBeenCalledWith(false);
      expect(refreshUser).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole("switch")).not.toBeChecked();
    expect(screen.getByText("Meal Intelligence disabled")).toBeInTheDocument();
  });

  it("validates matching passwords before using the existing password payload", async () => {
    await renderLoadedProfile();
    fireEvent.click(screen.getByRole("button", { name: "Change Password" }));

    fireEvent.change(screen.getByLabelText("Current Password"), {
      target: { value: "OldPassword1" },
    });
    fireEvent.change(screen.getByLabelText("New Password"), {
      target: { value: "NewPassword1" },
    });
    fireEvent.change(screen.getByLabelText("Confirm New Password"), {
      target: { value: "DifferentPassword1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Change Password" }));

    expect(await screen.findByText("New passwords do not match")).toBeInTheDocument();
    expect(mockChangePassword).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Confirm New Password"), {
      target: { value: "NewPassword1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Change Password" }));

    await waitFor(() => {
      expect(mockChangePassword).toHaveBeenCalledWith({
        current_password: "OldPassword1",
        new_password: "NewPassword1",
      });
    });
    expect(await screen.findByText("Password changed successfully")).toBeInTheDocument();
    expect(screen.queryByLabelText("Current Password")).not.toBeInTheDocument();
  });

  it("shows offline feedback and retries the profile request", async () => {
    mockGetCurrentUser.mockRejectedValueOnce(new Error("Network unavailable"));
    render(<ProfilePage />);

    const retry = await screen.findByRole("button", {
      name: "Retry connection",
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Profile management is unavailable",
    );

    fireEvent.click(retry);

    expect(await screen.findByText(PROFILE.email)).toBeInTheDocument();
    expect(mockGetCurrentUser).toHaveBeenCalledTimes(2);
  });
});
