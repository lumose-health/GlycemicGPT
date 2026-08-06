import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("renders persistent status text with semantic signal colors", () => {
    render(<StatusBadge variant="success">Connected</StatusBadge>);

    expect(screen.getByText("Connected")).toHaveClass(
      "border-signal-check-text",
      "text-signal-check-text",
    );
  });
});
