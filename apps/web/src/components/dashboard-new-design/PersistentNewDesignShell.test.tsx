import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { PersistentNewDesignShell } from "./PersistentNewDesignShell";

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
}));

jest.mock("@/components/auth-disclaimer-gate", () => ({
  AuthDisclaimerGate: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock("@/providers", () => ({
  AlertNotificationProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  UserProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

jest.mock("./dashboard-layout", () => ({
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

jest.mock("./dashboard-time-range-context", () => ({
  DashboardTimeRangeProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;

describe("PersistentNewDesignShell", () => {
  it.each(["/dashboard-new-design", "/settings-new/account"])(
    "wraps %s in the same redesigned layout",
    (pathname) => {
      mockUsePathname.mockReturnValue(pathname);

      render(
        <PersistentNewDesignShell isMockRuntimeEnabled={false}>
          <div>Page content</div>
        </PersistentNewDesignShell>,
      );

      expect(
        screen.getByTestId("persistent-dashboard-layout"),
      ).toHaveTextContent("Page content");
      expect(screen.getByText("Not medical advice")).toBeInTheDocument();
    },
  );

  it("does not wrap routes outside the redesigned app shell", () => {
    mockUsePathname.mockReturnValue("/dashboard/settings");

    render(
      <PersistentNewDesignShell isMockRuntimeEnabled={false}>
        <div>Old settings</div>
      </PersistentNewDesignShell>,
    );

    expect(screen.getByText("Old settings")).toBeInTheDocument();
    expect(
      screen.queryByTestId("persistent-dashboard-layout"),
    ).not.toBeInTheDocument();
  });

  it("adds mobile content padding to the new settings routes", () => {
    mockUsePathname.mockReturnValue("/settings-new/appearance");

    render(
      <PersistentNewDesignShell isMockRuntimeEnabled={false}>
        <div>Appearance</div>
      </PersistentNewDesignShell>,
    );

    expect(screen.getByTestId("persistent-dashboard-layout")).toHaveClass(
      "p-4",
      "lg:p-dashboard-panel-gap",
    );
  });
});
