import { fireEvent, render, screen, within } from "@testing-library/react";
import { usePathname } from "next/navigation";

import { useMealIntelligence } from "@/hooks/use-meal-intelligence";
import { useUserContext } from "@/providers/user-provider";

import { MobileNav } from "./MobileNav";

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(() => "/dashboard"),
}));

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

jest.mock("@/providers/user-provider", () => ({
  useUserContext: jest.fn(),
}));

jest.mock("@/hooks/use-meal-intelligence", () => ({
  useMealIntelligence: jest.fn(),
}));

jest.mock("@/lib/api", () => ({
  getUnreadInsightsCount: jest.fn(() => Promise.reject(new Error("offline"))),
  logoutUser: jest.fn(() => Promise.resolve()),
}));

const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;
const mockUseUserContext = useUserContext as jest.MockedFunction<
  typeof useUserContext
>;
const mockUseMealIntelligence = useMealIntelligence as jest.MockedFunction<
  typeof useMealIntelligence
>;

beforeEach(() => {
  mockUsePathname.mockReturnValue("/dashboard");
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
  mockUseMealIntelligence.mockReturnValue({
    enabled: true,
    isLoading: false,
  });
});

describe("MobileNav", () => {
  it("renders icon-only menu, dashboard, and account actions", () => {
    render(<MobileNav />);

    const bottomNavigation = screen.getByRole("navigation", {
      name: "Mobile navigation",
    });
    const dashboardLink = within(bottomNavigation).getByRole("link", {
      name: "Lumose",
    });
    const openButton = screen.getByRole("button", {
      name: "Open navigation menu",
    });
    const accountButton = screen.getByRole("button", {
      name: "Open account menu for Daniel",
    });

    expect(bottomNavigation).toHaveClass("fixed", "bottom-0", "lg:hidden");
    expect(openButton).toHaveClass(
      "h-11",
      "w-11",
      "text-foreground-primary",
    );
    expect(openButton).toHaveAttribute("aria-expanded", "false");
    const menuIcon = openButton.querySelector("svg");
    expect(menuIcon).toHaveClass("h-7", "w-7");
    expect(menuIcon?.querySelector("use")).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#menu",
    );
    expect(accountButton.querySelector("use")).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#person",
    );
    expect(dashboardLink).toHaveAttribute("href", "/dashboard");
    expect(bottomNavigation).not.toHaveTextContent("Menu");
    expect(bottomNavigation).not.toHaveTextContent("Account");
  });

  it("opens and closes the navigation drawer", () => {
    render(<MobileNav />);

    fireEvent.click(
      screen.getByRole("button", { name: "Open navigation menu" }),
    );

    const navigationDialog = screen.getByRole("dialog", {
      name: "Navigation menu",
    });
    const logoLink = within(navigationDialog).getByRole("link", {
      name: "Lumose",
    });
    const backdrop = screen.getByTestId("mobile-navigation-backdrop");
    const drawer = screen.getByTestId("mobile-navigation-drawer");

    expect(logoLink).toHaveAttribute("href", "/dashboard");
    expect(backdrop).toHaveClass("opacity-100", "duration-300");
    expect(drawer).toHaveClass("translate-x-0", "duration-300");
    expect(
      within(navigationDialog).queryByRole("button", {
        name: "Close navigation menu",
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(logoLink);

    expect(
      screen.queryByRole("dialog", { name: "Navigation menu" }),
    ).not.toBeInTheDocument();
    expect(backdrop).toHaveClass("opacity-0");
    expect(drawer).toHaveClass("-translate-x-full");
  });

  it("closes the navigation drawer with Escape", () => {
    render(<MobileNav />);

    fireEvent.click(
      screen.getByRole("button", { name: "Open navigation menu" }),
    );
    fireEvent.keyDown(document, { key: "Escape" });

    expect(
      screen.queryByRole("dialog", { name: "Navigation menu" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("mobile-navigation-drawer")).toHaveClass(
      "-translate-x-full",
    );
  });

  it("opens the account menu from the bottom navigation", () => {
    render(<MobileNav />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open account menu for Daniel",
      }),
    );

    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings/account",
    );
    expect(
      screen.getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
  });
});
