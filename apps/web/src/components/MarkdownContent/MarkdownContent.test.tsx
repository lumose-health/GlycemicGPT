import { render, screen } from "@testing-library/react";
import { isSafeMarkdownHref, MarkdownContent } from "./MarkdownContent";

describe("MarkdownContent", () => {
  it("renders Markdown through the shared semantic wrapper", () => {
    render(
      <MarkdownContent content={"## Summary\n\n**Stable** glucose today."} />,
    );

    expect(screen.getByTestId("markdown-content")).toHaveTextContent(
      "## Summary **Stable** glucose today.",
    );
    expect(screen.getByTestId("markdown-content").parentElement).toHaveClass(
      "font_body_2",
      "text-foreground-primary",
    );
  });

  it("allows only supported external URL protocols", () => {
    expect(isSafeMarkdownHref("https://example.com")).toBe(true);
    expect(isSafeMarkdownHref("http://example.com")).toBe(true);
    expect(isSafeMarkdownHref("mailto:hello@example.com")).toBe(true);
    expect(isSafeMarkdownHref("javascript:alert(1)")).toBe(false);
    expect(isSafeMarkdownHref("/internal")).toBe(false);
  });

  it("does not render an empty content wrapper", () => {
    const { container } = render(<MarkdownContent content="" />);

    expect(container).toBeEmptyDOMElement();
  });
});
