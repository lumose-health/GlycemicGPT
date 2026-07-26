import { render, screen } from "@testing-library/react";
import { AnimatedCard } from "./AnimatedCard";

describe("AnimatedCard", () => {
  it("renders children and disables animation for reduced motion", () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: true });

    render(
      <AnimatedCard className="custom-card">
        <span>Card content</span>
      </AnimatedCard>,
    );

    const card = screen.getByText("Card content").parentElement;
    expect(card).toHaveClass("custom-card");
    expect(card).toHaveStyle({ opacity: "1", transition: "none" });
  });
});
