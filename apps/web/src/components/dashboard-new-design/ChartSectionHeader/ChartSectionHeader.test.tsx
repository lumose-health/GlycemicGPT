import { render, screen } from "@testing-library/react";
import { ChartSectionHeader } from "./ChartSectionHeader";

describe("ChartSectionHeader", () => {
  it("renders a chart heading, information message, and details", () => {
    render(
      <ChartSectionHeader
        details={<span>Target range</span>}
        heading="Glucose"
        message="Drag chart to zoom"
        separator
        unit="mmol/L"
      />,
    );

    const heading = screen.getByRole("heading", { level: 3, name: "Glucose" });
    const header = heading.closest("header");

    expect(header).toHaveClass(
      "rounded-panel",
      "bg-surface-secondary",
      "text-foreground-primary",
    );
    expect(heading).toHaveClass("font_metric_label");
    expect(screen.getByText("Drag chart to zoom")).toBeInTheDocument();
    const unit = screen.getByText("mmol/L");

    expect(unit).toHaveClass(
      "shrink-0",
      "border-r",
      "border-border-active",
      "pl-3",
      "pr-3",
    );
    expect(unit).not.toHaveClass("w-9");
    expect(screen.getByText("Target range").parentElement).toHaveClass(
      "ml-auto",
    );
  });

  it("keeps the legacy chart header treatment without a separator", () => {
    render(<ChartSectionHeader heading="Pump basal" />);

    const header = screen
      .getByRole("heading", { level: 3, name: "Pump basal" })
      .closest("header");

    expect(header).toHaveClass("text-foreground-secondary");
    expect(header).not.toHaveClass("rounded-panel", "bg-surface-secondary");
    expect(header?.querySelector(".border-r")).toBeNull();
  });
});
