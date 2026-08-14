import { render, screen, waitFor } from "@testing-library/react";

const mockGetCurrentUser = jest.fn();

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

jest.mock("@/components/PublicDisclaimerModal", () => ({
  PublicDisclaimerModal: () => <div data-testid="public-disclaimer" />,
}));

jest.mock("@/lib/api", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

import { PublicHome } from "./PublicHome";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("PublicHome", () => {
  it("renders the V2 guest experience with canonical auth routes", async () => {
    mockGetCurrentUser.mockRejectedValue(new Error("not authenticated"));

    render(<PublicHome />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Your diabetes data, in clearer context.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("public-disclaimer")).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByText("Experimental software. Not medical advice."),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.getAllByRole("link", { name: "Sign in" })).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "Create account" }),
    ).toHaveAttribute("href", "/register");
  });

  it("offers the dashboard when the visitor is authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-1" });

    render(<PublicHome />);

    expect(
      await screen.findByRole("link", { name: "Go to dashboard" }),
    ).toHaveAttribute("href", "/dashboard");
    expect(
      screen.getAllByRole("link", { name: "Go to dashboard" }),
    ).toHaveLength(1);
    expect(
      screen.queryByRole("link", { name: "Create account" }),
    ).not.toBeInTheDocument();
  });

  it("omits the removed connected context panel", () => {
    mockGetCurrentUser.mockReturnValue(new Promise(() => {}));

    render(<PublicHome />);

    expect(screen.queryByText("CONNECTED CONTEXT")).not.toBeInTheDocument();
    expect(
      screen.queryByText("One view across your day"),
    ).not.toBeInTheDocument();
  });
});
