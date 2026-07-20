import { fireEvent, render, screen, within } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { useUserContext } from "@/providers";
import { useMealIntelligence } from "@/hooks/use-meal-intelligence";
import { MobileNav, Sidebar } from "./sidebar";

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(() => "/dashboard-new-design"),
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

jest.mock("@/providers", () => {
  return {
    useUserContext: jest.fn(),
  };
});

jest.mock("@/hooks/use-meal-intelligence", () => ({
  useMealIntelligence: jest.fn(),
}));

jest.mock("@/lib/api", () => ({
  getUnreadInsightsCount: jest.fn(() => Promise.reject(new Error("offline"))),
  logoutUser: jest.fn(() => Promise.resolve()),
}));

const mockUseUserContext = useUserContext as jest.MockedFunction<
  typeof useUserContext
>;
const mockUseMealIntelligence = useMealIntelligence as jest.MockedFunction<
  typeof useMealIntelligence
>;
const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;

function renderSidebar() {
  return render(<Sidebar />);
}

beforeEach(() => {
  mockUsePathname.mockReturnValue("/dashboard-new-design");
  window.localStorage.clear();
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
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

describe("dashboard new design Sidebar", () => {
  it("links the logo to the new dashboard", () => {
    renderSidebar();

    const logoLink = screen.getByRole("link", { name: "Lumose" });

    expect(logoLink).toHaveAttribute("href", "/dashboard-new-design");
    expect(logoLink).toHaveClass(
      "focus-visible:ring-2",
      "focus-visible:ring-border-active",
    );
  });

  it("collapses desktop navigation and swaps the toggle icon", () => {
    const { container } = renderSidebar();

    const sidebar = container.querySelector("aside");
    const collapseButton = screen.getByRole("button", {
      name: "Collapse sidebar",
    });

    expect(sidebar).toHaveClass("lg:w-64");
    expect(sidebar).toHaveAttribute("data-collapsed", "false");
    expect(collapseButton).toHaveAttribute("aria-expanded", "true");
    expect(collapseButton).toHaveClass("before:right-px");
    expect(collapseButton).not.toHaveClass("hover:bg-surface-primary");
    expect(collapseButton.querySelector("use")).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#sidebar-collapse",
    );

    fireEvent.click(collapseButton);

    const expandButton = screen.getByRole("button", {
      name: "Expand sidebar",
    });

    expect(sidebar).toHaveClass("lg:w-20");
    expect(sidebar).toHaveAttribute("data-collapsed", "true");
    expect(expandButton).toHaveAttribute("aria-expanded", "false");
    expect(expandButton).not.toHaveClass("mx-auto");
    expect(expandButton.querySelector("use")).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#sidebar-expand",
    );
  });

  it("fades logo and link text when collapsed", () => {
    renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    const logo = screen.getByRole("img", { name: "Lumose" });
    const logoIcons = logo.querySelectorAll("svg");
    const logoIcon = logoIcons[0];
    const wordmarkIcon = logoIcons[1];
    const logoText = wordmarkIcon.parentElement;
    const activeLink = screen.getByRole("link", { name: "Dashboard V2" });
    const activeLinkText = screen.getByText("Dashboard V2");

    expect(logoText).toHaveClass("max-w-0", "opacity-0");
    expect(logoText).toHaveClass("whitespace-nowrap");
    expect(wordmarkIcon).toHaveClass(
      "w-[135px]",
      "h-auto",
      "ml-1.5",
      "mt-0.5",
    );
    expect(wordmarkIcon.querySelector("use")).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#logo-text",
    );
    expect(screen.queryByText("Lumose")).not.toBeInTheDocument();
    expect(screen.queryByText("Glucose Monitoring")).not.toBeInTheDocument();
    expect(logoIcon).toHaveClass("w-[33px]", "h-auto");
    expect(logoIcon).toHaveClass("text-brand-gradient");
    expect(logoIcon).not.toHaveClass("text-accent");
    expect(logoIcon?.querySelector("use")).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#lumose-logo-icon-shape",
    );
    expect(activeLink).toHaveClass("gap-0", "pl-[22px]", "pr-0");
    expect(activeLink).not.toHaveClass("justify-center");
    expect(activeLinkText).toHaveClass("max-w-0", "opacity-0");
  });

  it("uses the open book icon for the Knowledge Base link", () => {
    renderSidebar();

    const knowledgeBaseLink = screen.getByRole("link", {
      name: "Knowledge Base",
    });

    expect(knowledgeBaseLink.querySelector("use")).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#book-open",
    );
  });

  it("uses the chat bubbles icon for the AI Chat link", () => {
    renderSidebar();

    const aiChatLink = screen.getByRole("link", {
      name: "AI Chat",
    });

    expect(aiChatLink.querySelector("use")).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#chat-bubbles",
    );
  });

  it("keeps the logo fixed and prevents collapsed horizontal overflow", () => {
    const { container } = renderSidebar();

    const sidebar = container.querySelector("aside");
    const header = container.querySelector("aside > div");
    const nav = container.querySelector("nav");

    expect(sidebar).toHaveClass("overflow-x-hidden");
    expect(header).toHaveClass(
      "h-dashboard-header-height",
      "justify-start",
      "px-[23.5px]",
    );
    expect(nav).toHaveClass("overflow-x-hidden", "overflow-y-auto");

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(header).toHaveClass(
      "h-dashboard-header-height",
      "justify-start",
      "px-[23.5px]",
    );
    expect(nav).toHaveClass("px-2");
    expect(
      screen.queryByRole("radiogroup", { name: "Theme selection" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the icon rail stable while expanding and collapsing", () => {
    const { container } = renderSidebar();

    const nav = container.querySelector("nav");
    const activeLink = screen.getByRole("link", { name: "Dashboard V2" });
    const collapseButton = screen.getByRole("button", {
      name: "Collapse sidebar",
    });

    expect(nav).toHaveClass("px-2");
    expect(activeLink).toHaveClass("pl-[22px]");
    expect(collapseButton).not.toHaveClass("mx-auto");

    fireEvent.click(collapseButton);

    const collapsedActiveLink = screen.getByRole("link", {
      name: "Dashboard V2",
    });
    const expandButton = screen.getByRole("button", {
      name: "Expand sidebar",
    });

    expect(nav).toHaveClass("px-2");
    expect(collapsedActiveLink).toHaveClass("gap-0", "pl-[22px]", "pr-0");
    expect(collapsedActiveLink).not.toHaveClass("justify-center");
    expect(expandButton).not.toHaveClass("mx-auto");
  });

  it("keeps the sidebar mounted while transitioning to settings links", () => {
    const { container, rerender } = renderSidebar();
    const logo = screen.getByRole("img", {
      name: "Lumose",
    });

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    mockUsePathname.mockReturnValue("/settings-new/profile");
    rerender(<Sidebar />);

    expect(
      screen.getByRole("img", { name: "Lumose" }),
    ).toBe(logo);
    expect(screen.getByRole("link", { name: "Lumose" })).toHaveAttribute(
      "href",
      "/dashboard-new-design",
    );
    expect(container.querySelector("aside")).toHaveAttribute(
      "data-collapsed",
      "true",
    );
    expect(
      container.querySelector('[data-navigation-mode="settings"]'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go back to app" }),
    ).toHaveAttribute("href", "/dashboard-new-design");
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Appearance" })).toHaveAttribute(
      "href",
      "/settings-new/appearance",
    );
    expect(screen.getByRole("link", { name: "Data" })).toHaveAttribute(
      "href",
      "/settings-new/data",
    );
    expect(
      screen.queryByRole("radiogroup", { name: "Theme selection" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Dashboard V2" }),
    ).not.toBeInTheDocument();
  });

  it("renders the menu and account actions in a mobile bottom navigation", () => {
    render(<MobileNav />);

    const bottomNavigation = screen.getByRole("navigation", {
      name: "Mobile navigation",
    });
    const openButton = screen.getByRole("button", {
      name: "Open navigation menu",
    });
    const accountButton = screen.getByRole("button", {
      name: "Open account menu for Daniel",
    });

    expect(bottomNavigation).toHaveClass("fixed", "bottom-0", "lg:hidden");
    expect(openButton).toHaveClass("text-foreground-primary");
    expect(openButton.querySelector("use")).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#menu",
    );
    expect(accountButton).toHaveTextContent("Account");
    expect(accountButton.querySelector("use")).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#person",
    );
  });

  it("opens navigation and account menus from the mobile bottom navigation", () => {
    render(<MobileNav />);

    fireEvent.click(
      screen.getByRole("button", { name: "Open navigation menu" }),
    );

    const navigationDialog = screen.getByRole("dialog", {
      name: "Navigation menu",
    });

    expect(navigationDialog).toBeInTheDocument();
    expect(
      within(navigationDialog).getByRole("link", { name: "Lumose" }),
    ).toHaveAttribute("href", "/dashboard-new-design");
    expect(
      screen.queryByRole("radiogroup", { name: "Theme selection" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(navigationDialog).getByRole("link", { name: "Lumose" }),
    );
    expect(
      screen.queryByRole("dialog", { name: "Navigation menu" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Open account menu for Daniel",
      }),
    );

    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings-new/profile",
    );
    expect(
      screen.getByRole("link", { name: "Settings (old)" }),
    ).toHaveAttribute("href", "/dashboard/settings");
    expect(
      screen.getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
  });
});
