import { render, screen } from "@testing-library/react";
import { CollapsibleSection } from "./collapsible-section";

describe("legacy CollapsibleSection", () => {
  it("keeps the original section presentation", () => {
    render(
      <CollapsibleSection title="Legacy section">
        <div>Legacy content</div>
      </CollapsibleSection>,
    );

    const button = screen.getByRole("button", { name: "Legacy section" });

    expect(button.parentElement).toHaveClass(
      "bg-white",
      "dark:bg-slate-900",
      "rounded-xl",
      "border-slate-200",
    );
    expect(button).toHaveClass(
      "rounded-xl",
      "focus-visible:ring-blue-500",
    );
    expect(screen.getByText("Legacy content").parentElement).toHaveClass(
      "px-6",
      "pb-6",
    );
  });
});
