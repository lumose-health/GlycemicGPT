import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { AppShell } from "./AppShell";

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
}));

jest.mock("@/components/AuthDisclaimerGate", () => ({
  AuthDisclaimerGate: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock("@/providers/user-provider", () => ({
  UserProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useUserContext: () => ({
    user: null,
    isLoading: true,
    error: null,
    refreshUser: jest.fn(),
  }),
}));

jest.mock("@/compositions/NotificationsProvider", () => ({
  NotificationsProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="notifications-provider">{children}</div>
  ),
}));

jest.mock("@/compositions/DashboardLayout", () => ({
  DashboardLayout: ({
    children,
    contentPaddingClassName,
  }: {
    children: ReactNode;
    contentPaddingClassName?: string;
  }) => (
    <div
      className={contentPaddingClassName}
      data-testid="persistent-dashboard-layout"
    >
      {children}
    </div>
  ),
}));

jest.mock("@/components/DashboardTimeRangeProvider", () => ({
  DashboardTimeRangeProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;

describe("AppShell", () => {
  it("anchors every V2 page to one viewport without document scrolling", () => {
    mockUsePathname.mockReturnValue("/dashboard");

    const { container } = render(
      <AppShell isMockRuntimeEnabled={false}>
        <div>Page content</div>
      </AppShell>,
    );

    expect(container.querySelector("[data-app-shell]")).toHaveClass(
      "fixed",
      "inset-0",
      "min-h-0",
      "overflow-hidden",
    );
  });

  it.each(["/dashboard", "/settings/account"])(
    "wraps %s in the same redesigned layout",
    (pathname) => {
      mockUsePathname.mockReturnValue(pathname);

      render(
        <AppShell isMockRuntimeEnabled={false}>
          <div>Page content</div>
        </AppShell>,
      );

      expect(
        screen.getByTestId("persistent-dashboard-layout"),
      ).toHaveTextContent("Page content");
      expect(screen.getByTestId("notifications-provider")).toBeInTheDocument();
      expect(screen.getByText("Not medical advice")).toBeInTheDocument();
    },
  );

  it("adds mobile content padding to settings routes", () => {
    mockUsePathname.mockReturnValue("/settings/appearance");

    render(
      <AppShell isMockRuntimeEnabled={false}>
        <div>Appearance</div>
      </AppShell>,
    );

    expect(screen.getByTestId("persistent-dashboard-layout")).toHaveClass(
      "p-4",
      "lg:p-dashboard-panel-gap",
    );
  });

  it("mounts a notification extension inside the V2 provider", () => {
    mockUsePathname.mockReturnValue("/dashboard");

    render(
      <AppShell
        isMockRuntimeEnabled
        notificationsExtension={<div>Notification tester</div>}
      >
        <div>Dashboard</div>
      </AppShell>,
    );

    expect(screen.getByText("Notification tester")).toBeInTheDocument();
    expect(screen.getByTestId("notifications-provider")).toContainElement(
      screen.getByText("Notification tester"),
    );
  });
});
