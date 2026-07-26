import { render, screen } from "@testing-library/react";

import { UnreadBadge } from "./UnreadBadge";

describe("UnreadBadge", () => {
  it("does not render when there are no unread items", () => {
    const { container } = render(<UnreadBadge count={0} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders the count with an accessible label", () => {
    render(<UnreadBadge count={4} />);

    const badge = screen.getByLabelText("4 unread");

    expect(badge).toHaveTextContent("4");
    expect(badge).toHaveClass(
      "rounded-xs",
      "bg-accent",
      "text-accent-foreground",
    );
  });

  it("caps the visible count without changing the accessible count", () => {
    render(<UnreadBadge count={120} />);

    expect(screen.getByLabelText("120 unread")).toHaveTextContent("99+");
  });
});
