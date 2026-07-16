import { render, screen } from "@testing-library/react";

import { DashboardLayout } from "./dashboard-layout";

jest.mock("./sidebar", () => ({
  MobileNav: () => <nav aria-label="Mobile navigation" />,
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
});
