import { fireEvent, render, screen } from "@testing-library/react";
import { useUserContext } from "@/providers";
import { useMealIntelligence } from "@/hooks/use-meal-intelligence";
import { Sidebar } from "./sidebar";

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

jest.mock("@/components/ThemeSwitcher", () => ({
  ThemeSwitcher: ({ className }: { className?: string }) => (
    <div aria-label="Theme selection" className={className} role="radiogroup" />
  ),
}));

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

function renderSidebar() {
  return render(<Sidebar />);
}

beforeEach(() => {
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

    const logoText = screen.getByText("Grafose").parentElement;
    const activeLink = screen.getByRole("link", { name: "Dashboard V2" });
    const activeLinkText = screen.getByText("Dashboard V2");

    expect(logoText).toHaveClass("max-w-0", "opacity-0");
    expect(logoText).toHaveClass("whitespace-nowrap");
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

  it("centers the collapsed icon column inside the sidebar", () => {
    const { container } = renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    const header = container.querySelector("aside > div");
    const nav = container.querySelector("nav");
    const themeSwitcher = screen.getByRole("radiogroup", {
      name: "Theme selection",
    });

    expect(header).toHaveClass("justify-start");
    expect(nav).toHaveClass("px-2");
    expect(themeSwitcher).toHaveClass("w-16");
    expect(themeSwitcher).not.toHaveClass("mx-auto");
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
});
