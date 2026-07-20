import { render, screen } from "@testing-library/react";
import { Panel } from "./Panel";

describe("Panel", () => {
  it("renders a labelled panel with a distinct header and body surface", () => {
    render(
      <Panel heading="Glucose overview" subheading="Last 24 hours">
        Trend chart
      </Panel>,
    );

    const panel = screen.getByRole("region", { name: "Glucose overview" });
    const heading = screen.getByRole("heading", {
      level: 2,
      name: "Glucose overview",
    });
    const subheading = screen.getByText("Last 24 hours");
    const body = screen.getByText("Trend chart");

    expect(panel).toHaveClass(
      "rounded-panel",
      "border",
      "border-border-default",
      "bg-surface-elevated",
    );
    expect(heading.closest("header")).toHaveClass(
      "border-b",
      "border-border-default",
      "bg-surface-secondary",
      "px-4",
    );
    expect(heading.closest("header")).not.toHaveClass("sm:px-6");
    expect(heading).toHaveClass(
      "font_poppins",
      "font_header_4",
      "text-foreground-primary",
    );
    expect(subheading).toHaveClass(
      "font_poppins",
      "font_body_3",
      "text-foreground-primary",
    );
    expect(body).toHaveClass(
      "bg-surface-elevated",
      "p-4",
      "text-foreground-primary",
    );
    expect(body).not.toHaveClass("p-3", "sm:p-6");
  });

  it("omits the subheading when one is not provided", () => {
    render(<Panel heading="Insulin summary">Summary content</Panel>);

    const heading = screen.getByRole("heading", { name: "Insulin summary" });

    expect(heading.nextElementSibling).toBeNull();
  });

  it("supports heading level, explicit heading id, and slot class names", () => {
    render(
      <Panel
        bodyClassName="custom-body"
        className="custom-panel"
        headerClassName="custom-header"
        heading="AGP report"
        headingClassName="custom-heading"
        headingId="agp-report-heading"
        headingLevel={3}
        subheading="Ambulatory glucose profile"
        subheadingClassName="custom-subheading"
      >
        Report content
      </Panel>,
    );

    const panel = screen.getByRole("region", { name: "AGP report" });
    const heading = screen.getByRole("heading", { level: 3, name: "AGP report" });
    const subheading = screen.getByText("Ambulatory glucose profile");

    expect(panel).toHaveAttribute("aria-labelledby", "agp-report-heading");
    expect(panel).toHaveClass("custom-panel");
    expect(heading).toHaveAttribute("id", "agp-report-heading");
    expect(heading).toHaveClass("custom-heading");
    expect(heading.closest("header")).toHaveClass("custom-header");
    expect(subheading).toHaveClass("custom-subheading");
    expect(screen.getByText("Report content")).toHaveClass("custom-body");
  });

  it("visually hides the header only on mobile while preserving its semantics", () => {
    render(
      <Panel disableHeaderMobile heading="Live CGM">
        Current reading
      </Panel>,
    );

    const panel = screen.getByRole("region", { name: "Live CGM" });
    const header = screen.getByRole("heading", { name: "Live CGM" }).closest(
      "header",
    );

    expect(panel).toBeInTheDocument();
    expect(header).toHaveClass(
      "sr-only",
      "lg:not-sr-only",
      "lg:px-4",
      "lg:py-3",
    );
  });

  it("visually hides the header only on desktop", () => {
    render(
      <Panel disableHeaderDesktop heading="Desktop hidden">
        Panel content
      </Panel>,
    );

    const header = screen
      .getByRole("heading", { name: "Desktop hidden" })
      .closest("header");

    expect(header).toHaveClass("lg:sr-only");
    expect(header).not.toHaveClass("sr-only");
  });

  it("supports full width square panels on mobile", () => {
    render(
      <Panel fullWidthMobile heading="Mobile chart">
        Chart content
      </Panel>,
    );

    expect(screen.getByRole("region", { name: "Mobile chart" })).toHaveClass(
      "-mx-dashboard-panel-gap",
      "rounded-none",
      "lg:mx-0",
      "lg:rounded-panel",
    );
  });
});
