import { fireEvent, render, screen } from "@testing-library/react";
import { ConnectionCollapsibleSection } from "./ConnectionCollapsibleSection";

describe("ConnectionCollapsibleSection", () => {
  it("uses distinct semantic surfaces for its header and body", () => {
    render(
      <ConnectionCollapsibleSection defaultOpen={false} title="Dexcom G6/G7">
        Connection form
      </ConnectionCollapsibleSection>,
    );

    const button = screen.getByRole("button", { name: "Dexcom G6/G7" });
    const accordion = button.parentElement;
    const region = screen.getByRole("region", { hidden: true });

    expect(accordion).toHaveClass(
      "overflow-hidden",
      "rounded-panel",
      "border",
      "border-border-default",
      "bg-surface-elevated",
    );
    expect(button).toHaveClass(
      "bg-surface-secondary",
      "cursor-pointer",
      "text-foreground-primary",
    );
    expect(button).not.toHaveClass("border-b");
    expect(region).toHaveClass(
      "grid-rows-[0fr]",
      "transition-[grid-template-rows]",
    );

    fireEvent.click(button);

    expect(button).toHaveClass("border-b", "border-border-default");
    expect(region).toHaveClass(
      "bg-surface-elevated",
      "grid-rows-[1fr]",
      "text-foreground-primary",
    );
    expect(region.firstElementChild?.firstElementChild).toHaveClass(
      "px-6",
      "pb-6",
      "pt-6",
    );
  });

  it("matches shared connection row typography for icon subsections", () => {
    render(
      <ConnectionCollapsibleSection
        defaultOpen={false}
        iconName="link"
        title="Glooko"
        variant="subsection"
      >
        Connection form
      </ConnectionCollapsibleSection>,
    );

    const button = screen.getByRole("button", { name: "Glooko" });

    expect(button.querySelector("use")).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#link",
    );
    expect(screen.getByText("Glooko")).toHaveClass(
      "font_body_2",
      "text-foreground-primary",
    );

    fireEvent.click(button);

    const region = screen.getByRole("region", { name: "Glooko" });
    expect(region.firstElementChild?.firstElementChild).toHaveClass(
      "px-4",
      "pb-4",
      "pt-4",
    );
  });
});
