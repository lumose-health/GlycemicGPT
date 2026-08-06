import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnimatedCard } from "./AnimatedCard";

const originalMatchMedia = window.matchMedia;

describe("AnimatedCard", () => {
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    jest.useRealTimers();
  });

  it("renders children and disables animation for reduced motion", () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: true });

    render(
      <AnimatedCard className="custom-card">
        <span>Card content</span>
      </AnimatedCard>,
    );

    const card = screen.getByText("Card content").parentElement;
    expect(card).toHaveClass("custom-card");
    expect(card).toHaveStyle({
      opacity: "1",
      transition: "none",
      visibility: "visible",
    });
  });

  it("reveals a zero-delay card immediately with its transition intact", () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: false });

    render(
      <AnimatedCard>
        <button>Immediate action</button>
      </AnimatedCard>,
    );

    expect(
      screen.getByRole("button", { name: "Immediate action" }).parentElement,
    ).toHaveStyle({
      opacity: "1",
      transition: "opacity 0.3s ease-out",
      visibility: "visible",
    });
  });

  it("keeps controls hidden from keyboard focus until the delay finishes", async () => {
    jest.useFakeTimers();
    window.matchMedia = jest.fn().mockReturnValue({ matches: false });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(
      <>
        <button>Before card</button>
        <AnimatedCard delay={0.1}>
          <button>Card action</button>
        </AnimatedCard>
      </>,
    );

    const beforeCard = screen.getByRole("button", { name: "Before card" });
    const cardAction = screen.getByText("Card action");
    const card = cardAction.parentElement;

    expect(card).toHaveStyle({ opacity: "0", visibility: "hidden" });
    beforeCard.focus();
    await user.tab();
    expect(cardAction).not.toHaveFocus();

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(card).toHaveStyle({ opacity: "1", visibility: "visible" });
    beforeCard.focus();
    await user.tab();
    expect(cardAction).toHaveFocus();
  });
});
