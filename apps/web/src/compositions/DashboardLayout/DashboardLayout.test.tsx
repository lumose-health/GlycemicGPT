import { render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";

import { DashboardLayout } from "./DashboardLayout";

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
}));

jest.mock("@/components/MobileNav", () => ({
  MobileNav: () => <nav aria-label="Mobile navigation" />,
}));

jest.mock("@/components/Sidebar", () => ({
  Sidebar: () => <aside aria-label="Desktop navigation" />,
}));

const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;

describe("DashboardLayout", () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue("/dashboard");
  });

  it("uses the shared dashboard panel gap for its content padding", () => {
    render(
      <DashboardLayout>
        <div>Dashboard content</div>
      </DashboardLayout>,
    );

    expect(screen.getByRole("main")).toHaveClass(
      "min-h-0",
      "overflow-y-auto",
      "overscroll-contain",
      "p-dashboard-panel-gap",
      "lg:pb-dashboard-panel-gap",
      "[scrollbar-gutter:stable]",
    );
    expect(screen.getByRole("main")).toHaveAttribute(
      "data-dashboard-scroll-container",
    );
  });

  it("resets the persistent content scroller when the V2 route changes", () => {
    const { rerender } = render(
      <DashboardLayout>
        <div>Dashboard content</div>
      </DashboardLayout>,
    );
    const main = screen.getByRole("main");
    main.scrollTop = 480;

    mockUsePathname.mockReturnValue("/dashboard/knowledge-base");
    rerender(
      <DashboardLayout>
        <div>Knowledge base content</div>
      </DashboardLayout>,
    );

    expect(main.scrollTop).toBe(0);
  });

  it("accepts responsive content padding overrides", () => {
    render(
      <DashboardLayout contentPaddingClassName="p-4 lg:p-dashboard-panel-gap">
        <div>Settings content</div>
      </DashboardLayout>,
    );

    expect(screen.getByRole("main")).toHaveClass(
      "p-4",
      "lg:p-dashboard-panel-gap",
    );
    expect(screen.getByRole("main")).not.toHaveClass("p-dashboard-panel-gap");
  });
});
