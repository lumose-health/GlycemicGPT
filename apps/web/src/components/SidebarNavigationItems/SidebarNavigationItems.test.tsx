import { fireEvent, render, screen } from "@testing-library/react";

import type { SidebarNavItem } from "@/components/Sidebar/sidebar-navigation";

import { SidebarNavigationItems } from "./SidebarNavigationItems";

jest.mock("next/link", () => {
  return function MockLink({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  };
});

const items: readonly SidebarNavItem[] = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: "home",
    activeIcon: "home-fill",
  },
  {
    name: "Daily Briefs",
    href: "/dashboard/briefs",
    icon: "clock",
    activeIcon: "clock-fill",
    badgeKey: "briefs",
  },
];

describe("SidebarNavigationItems", () => {
  it("marks nested navigation as active without activating the dashboard root", () => {
    render(
      <SidebarNavigationItems
        items={items}
        pathname="/dashboard/briefs/today"
        unreadCount={0}
      />,
    );

    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByRole("link", { name: "Daily Briefs" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("renders the unread badge and forwards navigation clicks", () => {
    const handleClick = jest.fn();
    render(
      <SidebarNavigationItems
        collapsed
        items={items}
        onClick={handleClick}
        pathname="/dashboard"
        unreadCount={120}
      />,
    );

    expect(screen.getByLabelText("120 unread")).toHaveTextContent("99+");
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveClass(
      "gap-0",
      "pl-[22px]",
      "pr-0",
    );

    fireEvent.click(screen.getByRole("link", { name: /^Daily Briefs/ }));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
