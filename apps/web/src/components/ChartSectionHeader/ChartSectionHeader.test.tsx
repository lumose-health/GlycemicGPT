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
      "my-1",
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

  it("uses the approved foreground without a separator", () => {
    render(<ChartSectionHeader heading="Pump basal" />);

    const heading = screen.getByRole("heading", {
      level: 3,
      name: "Pump basal",
    });
    const header = heading.closest("header");

    expect(header).toHaveClass("text-foreground-primary");
    expect(header).not.toHaveClass("rounded-panel", "bg-surface-secondary");
    expect(header?.querySelector(".border-r")).toBeNull();
    expect(heading.parentElement).toHaveClass("pl-9");
  });

  it("does not reserve unit space for a separator header without a unit", () => {
    render(<ChartSectionHeader heading="Pump activity" separator />);

    const heading = screen.getByRole("heading", {
      level: 3,
      name: "Pump activity",
    });
    const header = heading.closest("header");

    expect(header?.querySelector(".border-r")).toBeNull();
    expect(heading.parentElement).toHaveClass("pl-3");
    expect(heading.parentElement).not.toHaveClass("pl-9");
  });

  it("renders zero-valued ReactNode props and applies unit padding", () => {
    render(
      <ChartSectionHeader details={0} heading="Glucose" message={0} unit={0} />,
    );

    const heading = screen.getByRole("heading", { level: 3, name: "Glucose" });
    const header = heading.closest("header");
    const unit = header?.querySelector(".border-r");
    const message = header?.querySelector("p");
    const details = header?.querySelector(".ml-auto");

    expect(unit).toHaveTextContent("0");
    expect(message).toHaveTextContent("0");
    expect(details).toHaveTextContent("0");
    expect(heading.parentElement).toHaveClass("pl-3");
    expect(heading.parentElement).not.toHaveClass("pl-9");
  });
});
