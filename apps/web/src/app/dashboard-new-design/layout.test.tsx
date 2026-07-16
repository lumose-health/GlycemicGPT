import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import { getInitialMockRuntimeEnabled } from "@/mocks/server";
import Layout from "./layout";

jest.mock("@/mocks/server", () => ({
  getInitialMockRuntimeEnabled: jest.fn(),
}));

jest.mock("@/components/dashboard-new-design", () => ({
  Banner: jest.requireActual("@/components/dashboard-new-design/Banner").Banner,
  DashboardLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
  DashboardTimeRangeProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock("@/components/auth-disclaimer-gate", () => ({
  AuthDisclaimerGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

jest.mock("@/providers", () => ({
  AlertNotificationProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  UserProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const getInitialMockRuntimeEnabledMock = jest.mocked(
  getInitialMockRuntimeEnabled,
);

describe("dashboard new design layout", () => {
  beforeEach(() => {
    getInitialMockRuntimeEnabledMock.mockReset();
  });

  it("renders the default banner when mock data is inactive", async () => {
    getInitialMockRuntimeEnabledMock.mockResolvedValue(false);

    render(await Layout({ children: <div>Dashboard</div> }));

    expect(screen.getByText("Not medical advice")).toHaveClass(
      "bg-surface-fixed-dark",
    );
  });

  it("renders the mock banner when the request enables mock data", async () => {
    getInitialMockRuntimeEnabledMock.mockResolvedValue(true);

    render(await Layout({ children: <div>Dashboard</div> }));

    expect(
      screen.getByText(
        "Mock data is active. All data shown is generated and is not your own.",
      ),
    ).toHaveClass("bg-surface-fixed-critical");
  });
});
