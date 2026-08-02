import { fireEvent, render, screen } from "@testing-library/react";

import { useUserContext } from "@/providers/user-provider";

import { SidebarAccountControls } from "./SidebarAccountControls";

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

jest.mock("@/lib/api", () => ({
  logoutUser: jest.fn(() => Promise.resolve()),
}));

const mockUseUserContext = useUserContext as jest.MockedFunction<
  typeof useUserContext
>;

beforeEach(() => {
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
});

describe("SidebarAccountControls", () => {
  it("opens the account menu and emits settings navigation", () => {
    const handleNavigate = jest.fn();
    render(<SidebarAccountControls onNavigate={handleNavigate} />);

    const accountButton = screen.getByRole("button", { name: "Daniel" });

    expect(accountButton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(accountButton);
    expect(accountButton).toHaveAttribute("aria-expanded", "true");

    const settingsLink = screen.getByRole("link", { name: "Settings" });
    expect(settingsLink).toHaveAttribute("href", "/settings/account");

    fireEvent.click(settingsLink);

    expect(handleNavigate).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", { name: "Sign out" }),
    ).not.toBeInTheDocument();
  });

  it("provides a descriptive compact account control", () => {
    render(<SidebarAccountControls compact />);

    const accountButton = screen.getByRole("button", {
      name: "Open account menu for Daniel",
    });

    expect(accountButton).not.toHaveTextContent("Account");
    expect(accountButton.querySelector("use")).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#person",
    );

    fireEvent.click(accountButton);

    expect(
      screen.getByRole("button", {
        name: "Close account menu for Daniel",
      }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("hides the account name when collapsed", () => {
    render(<SidebarAccountControls collapsed />);

    expect(screen.getByText("Daniel")).toHaveClass("max-w-0", "opacity-0");
  });
});
