import { render, screen } from "@testing-library/react";

import { DashboardLayout } from "./DashboardLayout";

jest.mock("@/components/MobileNav", () => ({
  MobileNav: () => <nav aria-label="Mobile navigation" />,
}));

jest.mock("@/components/Sidebar", () => ({
  Sidebar: () => <aside aria-label="Desktop navigation" />,
}));

describe("DashboardLayout", () => {
  it("uses the shared dashboard panel gap for its content padding", () => {
    render(
      <DashboardLayout>
        <div>Dashboard content</div>
      </DashboardLayout>,
    );

    expect(screen.getByRole("main")).toHaveClass(
      "p-dashboard-panel-gap",
      "lg:pb-dashboard-panel-gap",
    );
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
