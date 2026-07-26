import { render, screen } from "@testing-library/react";
import { DashboardSidebarLink } from "./DashboardSidebarLink";

describe("DashboardSidebarLink", () => {
  it("renders an inactive sidebar link with a sprite icon", () => {
    const { container } = render(
      <DashboardSidebarLink href="/dashboard" icon="home" label="Dashboard" />,
    );

    const link = screen.getByRole("link", { name: "Dashboard" });

    expect(link).toHaveAttribute("href", "/dashboard");
    expect(link).toHaveClass("text-foreground-secondary");
    expect(link).toHaveClass("hover:text-foreground-primary");
    expect(link).toHaveClass("rounded-panel");
    expect(link).toHaveClass("pl-[22px]");
    expect(link).not.toHaveClass("rounded-lg");
    expect(link).not.toHaveAttribute("aria-current");
    expect(container.querySelector("use")).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#home",
    );
  });

  it("marks the active page and swaps to the active icon", () => {
    const { container } = render(
      <DashboardSidebarLink
        activeIcon="home-fill"
        href="/dashboard"
        icon="home"
        isActive
        label="Dashboard"
      />,
    );

    const link = screen.getByRole("link", { name: "Dashboard" });

    expect(link).toHaveAttribute("aria-current", "page");
    expect(link).toHaveClass("bg-surface-elevated");
    expect(link).toHaveClass("text-foreground-primary");
    expect(link).not.toHaveClass("bg-accent");
    expect(container.querySelector("use")).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#home-fill",
    );
  });

  it("renders document navigation as a plain anchor and keeps badges visible", () => {
    render(
      <DashboardSidebarLink
        badge={<span aria-label="2 unread">2</span>}
        documentNavigation
        href="/dashboard"
        icon="desktop-device"
        label="Dashboard V1"
      />,
    );

    const link = screen.getByRole("link", { name: "Dashboard V1 2 unread" });

    expect(link).toHaveAttribute("href", "/dashboard");
    expect(screen.getByLabelText("2 unread")).toBeInTheDocument();
  });

  it("fades label and badge content when collapsed", () => {
    render(
      <DashboardSidebarLink
        badge={<span aria-label="2 unread">2</span>}
        collapsed
        href="/dashboard"
        icon="home"
        label="Dashboard"
      />,
    );

    const link = screen.getByRole("link", { name: "Dashboard 2 unread" });
    const label = screen.getByText("Dashboard");
    const badge = screen.getByLabelText("2 unread").parentElement;

    expect(link).toHaveClass("gap-0", "pl-[22px]", "pr-0");
    expect(link).not.toHaveClass("justify-center");
    expect(label).toHaveClass("max-w-0", "opacity-0", "whitespace-nowrap");
    expect(badge).toHaveClass("w-0", "opacity-0");
  });
});
