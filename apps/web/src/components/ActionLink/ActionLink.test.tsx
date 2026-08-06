import { render, screen } from "@testing-library/react";
import { ActionLink } from "./ActionLink";

describe("ActionLink", () => {
  it("renders a keyboard focusable highlighted link", () => {
    render(<ActionLink href="/settings">Open settings</ActionLink>);

    const link = screen.getByRole("link", { name: "Open settings" });
    expect(link).toHaveAttribute("href", "/settings");
    expect(link).toHaveClass("bg-accent", "text-accent-foreground");
  });
});
