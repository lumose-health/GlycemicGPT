import { fireEvent, render, screen } from "@testing-library/react";
import { Accordion } from "./Accordion";

describe("Accordion", () => {
  it("animates an uncontrolled panel with grid row Tailwind classes", () => {
    render(
      <Accordion defaultOpen={false} trigger="Connection details">
        <button type="button">Nested action</button>
      </Accordion>,
    );

    const trigger = screen.getByRole("button", {
      name: "Connection details",
    });
    const chevron = trigger.querySelector("svg");
    const region = screen.getByRole("region", { hidden: true });

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(chevron).toHaveClass("rotate-90");
    expect(region).toHaveClass(
      "grid",
      "grid-rows-[0fr]",
      "transition-[grid-template-rows]",
    );
    expect(region).toHaveAttribute("aria-hidden", "true");
    expect(region).toHaveAttribute("inert");
    expect(region).not.toHaveAttribute("style");

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(chevron).toHaveClass("-rotate-90");
    expect(region).toHaveClass("grid-rows-[1fr]");
    expect(region).toHaveAttribute("aria-hidden", "false");
    expect(region).not.toHaveAttribute("inert");
  });

  it("supports controlled state changes", () => {
    const onOpenChange = jest.fn();
    const { rerender } = render(
      <Accordion
        onOpenChange={onOpenChange}
        open={false}
        trigger="Controlled details"
      >
        Controlled content
      </Accordion>,
    );

    const trigger = screen.getByRole("button", {
      name: "Controlled details",
    });
    const region = screen.getByRole("region", { hidden: true });

    fireEvent.click(trigger);

    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(region).toHaveClass("grid-rows-[0fr]");

    rerender(
      <Accordion
        onOpenChange={onOpenChange}
        open
        trigger="Controlled details"
      >
        Controlled content
      </Accordion>,
    );

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(region).toHaveClass("grid-rows-[1fr]");
  });
});
