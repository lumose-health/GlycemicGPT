/**
 * Tests for the Header component.
 *
 * Story 4.1: Dashboard Layout & Navigation
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { Header } from "../../../src/components/layout/header";

// Mock next/navigation
jest.mock("next/navigation", () => ({
  usePathname: jest.fn(() => "/dashboard"),
}));

// Mock next/link
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

describe("Header", () => {
  it("renders the mobile logo", () => {
    render(<Header />);
    expect(screen.getByText("GlycemicGPT")).toBeInTheDocument();
  });

  it("renders the account button", () => {
    render(<Header />);
    expect(screen.getByText("Account")).toBeInTheDocument();
  });

  it("opens user menu when account button is clicked", () => {
    render(<Header />);
    const accountButton = screen.getByText("Account").closest("button");

    fireEvent.click(accountButton!);

    // Menu should now be visible
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Sign out")).toBeInTheDocument();
  });

  it("has a settings link in the user menu", () => {
    render(<Header />);
    const accountButton = screen.getByText("Account").closest("button");

    fireEvent.click(accountButton!);

    const settingsLink = screen.getByText("Settings").closest("a");
    expect(settingsLink).toHaveAttribute("href", "/dashboard/settings");
  });

  it("closes user menu when clicking outside", () => {
    render(<Header />);
    const accountButton = screen.getByText("Account").closest("button");

    // Open menu
    fireEvent.click(accountButton!);
    expect(screen.getByText("Sign out")).toBeInTheDocument();

    // Click outside (simulate by clicking on the header itself)
    fireEvent.mouseDown(document.body);

    // Menu should be closed
    expect(screen.queryByText("Sign out")).not.toBeInTheDocument();
  });

  it("has aria-expanded attribute on account button", () => {
    render(<Header />);
    const accountButton = screen.getByText("Account").closest("button");

    expect(accountButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(accountButton!);

    expect(accountButton).toHaveAttribute("aria-expanded", "true");
  });
});
