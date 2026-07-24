import { render, screen } from "@testing-library/react";
import { useUserContext } from "@/providers";

import AccountPage from "./account/page";
import AlarmsNotificationSettingsPage from "./alarms-notification/page";
import HealthSettingsPage from "./health/page";

jest.mock("@/providers", () => ({
  useUserContext: jest.fn(),
}));

jest.mock("./profile/ProfileSettings", () => ({
  ProfileSettings: ({ sections }: { sections: string[] }) => (
    <div>Profile sections: {sections.join(", ")}</div>
  ),
}));

jest.mock("./glucose-range/page", () => ({
  __esModule: true,
  default: () => <div>Glucose range settings</div>,
}));

jest.mock("./insulin/page", () => ({
  __esModule: true,
  default: () => <div>Insulin settings</div>,
}));

jest.mock("./safety-limits/page", () => ({
  __esModule: true,
  default: () => <div>Safety limit settings</div>,
}));

jest.mock("./alerts/page", () => ({
  __esModule: true,
  default: () => <div>Alert settings</div>,
}));

jest.mock("./brief-delivery/page", () => ({
  __esModule: true,
  default: () => <div>Daily brief settings</div>,
}));

jest.mock("./communications/CommunicationsSettings", () => ({
  CommunicationsSettings: () => <div>Delivery channel settings</div>,
}));

jest.mock("./telegram/page", () => ({
  __esModule: true,
  default: () => <div>Telegram settings</div>,
}));

const mockUseUserContext = useUserContext as jest.MockedFunction<
  typeof useUserContext
>;

beforeEach(() => {
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
      id: "user-1",
      is_active: true,
      role: "diabetic",
    },
  });
});

describe("consolidated settings pages", () => {
  it("keeps Account focused on account settings", () => {
    render(<AccountPage />);

    expect(screen.getByText("Profile sections: account")).toBeInTheDocument();
  });

  it("groups glucose display, ranges, insulin action, and safety limits", () => {
    render(<HealthSettingsPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Glucose & Insulin" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Profile sections: glucose")).toBeInTheDocument();
    expect(screen.getByText("Glucose range settings")).toBeInTheDocument();
    expect(screen.getByText("Insulin settings")).toBeInTheDocument();
    expect(screen.getByText("Safety limit settings")).toBeInTheDocument();
  });

  it("groups patient alerts, briefs, delivery channels, and Telegram", () => {
    render(<AlarmsNotificationSettingsPage />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Alarms & Notifications",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Alert settings")).toBeInTheDocument();
    expect(screen.getByText("Daily brief settings")).toBeInTheDocument();
    expect(screen.getByText("Delivery channel settings")).toBeInTheDocument();
    expect(screen.getByText("Telegram settings")).toBeInTheDocument();
  });

  it("limits caregiver notifications to delivery channels", () => {
    mockUseUserContext.mockReturnValue({
      ...mockUseUserContext(),
      user: {
        ...mockUseUserContext().user!,
        role: "caregiver",
      },
    });

    render(<AlarmsNotificationSettingsPage />);

    expect(screen.queryByText("Alert settings")).not.toBeInTheDocument();
    expect(screen.queryByText("Daily brief settings")).not.toBeInTheDocument();
    expect(screen.getByText("Delivery channel settings")).toBeInTheDocument();
    expect(screen.getByText("Telegram settings")).toBeInTheDocument();
  });
});
