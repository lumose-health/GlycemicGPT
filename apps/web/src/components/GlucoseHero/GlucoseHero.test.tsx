import { render, screen, within } from "@testing-library/react";
import { GlucoseHero } from "@/components/GlucoseHero";

const defaultProps = {
  basalRate: 1.5,
  batteryPct: 85,
  iob: 2.4,
  reservoirUnits: 180,
  trend: "Stable" as const,
  value: 120,
};
const NOW_MS = new Date("2026-05-08T12:00:00.000Z").getTime();

describe("Dashboard GlucoseHero", () => {
  it("keeps its range tinted card shell by default", () => {
    render(<GlucoseHero {...defaultProps} />);

    expect(screen.getByRole("region", { name: "Current glucose reading" })).toHaveClass(
      "rounded-panel",
      "border",
      "bg-signal-check-fill/10",
    );
  });

  it("uses shared classification with patient specific thresholds", () => {
    render(
      <GlucoseHero
        {...defaultProps}
        thresholds={{ urgentLow: 60, low: 80, high: 160, urgentHigh: 220 }}
        value={70}
      />,
    );

    expect(screen.getByRole("region", { name: "Current glucose reading" })).toHaveClass(
      "bg-signal-warning-fill/10",
    );
    expect(screen.getByTestId("glucose-indicator-shape")).toHaveClass(
      "text-signal-warning-fill",
    );
  });

  it("marks delayed and stale readings without hiding their values", () => {
    const { rerender } = render(
      <GlucoseHero {...defaultProps} embedded isDelayed value={210} />,
    );

    expect(screen.getByTestId("glucose-indicator")).toHaveAttribute(
      "data-freshness",
      "delayed",
    );
    expect(screen.getByTestId("glucose-indicator-value")).toHaveAccessibleName(
      /delayed reading/i,
    );

    rerender(
      <GlucoseHero {...defaultProps} embedded isStale value={210} />,
    );

    expect(screen.getByTestId("glucose-indicator")).toHaveAttribute(
      "data-freshness",
      "stale",
    );
    expect(screen.getByTestId("glucose-indicator-value")).toHaveAccessibleName(
      /stale reading/i,
    );
  });

  it.each([19, 501])("hides an out of range reading of %s mg/dL", (value) => {
    render(<GlucoseHero {...defaultProps} value={value} />);

    expect(screen.getByTestId("glucose-indicator-value")).toHaveTextContent("--");
  });

  it("removes the range background and rounded shell when embedded", () => {
    render(<GlucoseHero {...defaultProps} embedded />);

    const hero = screen.getByRole("region", { name: "Current glucose reading" });

    expect(hero).not.toHaveClass("rounded-panel");
    expect(hero).not.toHaveClass("border");
    expect(hero).not.toHaveClass("bg-signal-check-fill/10");
    expect(screen.getByText("IoB")).toHaveClass("text-foreground-primary");
  });

  it("uses a horizontal desktop layout with stacked metrics when embedded", () => {
    render(<GlucoseHero {...defaultProps} embedded />);

    expect(screen.getByTestId("glucose-hero-content")).toHaveClass(
      "lg:flex-row",
      "lg:w-full",
      "lg:justify-evenly",
      "lg:gap-8",
    );
    expect(screen.getByTestId("glucose-indicator")).toHaveClass(
      "lg:scale-[1.18]",
    );
    expect(screen.getByTestId("secondary-metrics")).toHaveClass(
      "lg:grid",
      "lg:grid-cols-1",
      "lg:mt-0",
    );
  });

  it("can hide pump stats when the page renders them separately", () => {
    render(<GlucoseHero {...defaultProps} embedded showPumpStats={false} />);

    expect(screen.queryByTestId("secondary-metrics")).not.toBeInTheDocument();
    expect(screen.getByTestId("glucose-hero-content")).toBeInTheDocument();
  });

  it("uses the glucose indicator shape for the embedded loading state", () => {
    render(
      <GlucoseHero
        {...defaultProps}
        embedded
        isLoading
        showPumpStats={false}
      />,
    );

    expect(
      screen.getByRole("region", { name: "Loading glucose reading" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(
      screen.queryByTestId("glucose-hero-loading-unit"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("glucose-hero-loading-shape")).toHaveClass(
      "text-surface-tertiary",
    );
    expect(screen.getByTestId("glucose-hero-loading-value")).toHaveClass(
      "bg-surface-tertiary",
      "rounded-panel",
    );
    expect(
      screen.queryByTestId("glucose-hero-loading-metrics"),
    ).not.toBeInTheDocument();
  });

  it("moves the unit label to the panel top left when embedded", () => {
    render(<GlucoseHero {...defaultProps} embedded />);

    expect(screen.getByTestId("glucose-hero-unit")).toHaveTextContent("[mg/dL]");
    expect(screen.getByTestId("glucose-hero-unit")).toHaveClass(
      "left-4",
      "top-4",
      "text-foreground-primary/70",
    );
    expect(screen.queryByTestId("glucose-indicator-unit")).not.toBeInTheDocument();
  });

  it("shows the latest glucose reading age at the panel top right when embedded", () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(NOW_MS);

    try {
      render(
        <GlucoseHero
          {...defaultProps}
          embedded
          timestamp={new Date(NOW_MS - 125_000).toISOString()}
        />,
      );

      expect(screen.getByTestId("glucose-hero-updated-at")).toHaveTextContent(
        "Updated 2m 5s ago",
      );
      expect(screen.getByTestId("glucose-hero-updated-at")).toHaveClass(
        "text-foreground-primary/70",
      );
      expect(screen.getByTestId("glucose-hero-updated-at").parentElement).toHaveClass(
        "right-4",
        "top-4",
        "text-right",
      );
      expect(screen.getByTestId("glucose-hero-updated-at")).not.toHaveClass(
        "text-signal-warning-text",
        "text-signal-error-text",
      );
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("shows the mmol comparison below the updated time", () => {
    render(
      <GlucoseHero
        {...defaultProps}
        embedded
        previousValue={118}
        readingAgeNow={NOW_MS}
        timestamp={new Date(NOW_MS - 5_000).toISOString()}
        unit="mmol"
      />,
    );

    expect(screen.getByTestId("glucose-hero-comparison")).toHaveTextContent(
      "+0.1",
    );
    const comparison = screen.getByTestId("glucose-hero-comparison");
    expect(comparison).not.toHaveAttribute("aria-label");
    expect(
      within(comparison).getByText(
        "Change from previous reading: +0.1 millimoles per litre",
      ),
    ).toHaveClass("sr-only");
    expect(within(comparison).getByText("+0.1")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(
      screen.getByTestId("glucose-hero-updated-at").nextElementSibling,
    ).toBe(screen.getByTestId("glucose-hero-comparison"));
  });

  it("shows a negative comparison", () => {
    render(
      <GlucoseHero
        {...defaultProps}
        embedded
        previousValue={127}
        unit="mmol"
      />,
    );

    expect(screen.getByTestId("glucose-hero-comparison")).toHaveTextContent(
      "-0.4",
    );
  });

  it("uses Lumose receipt age for the updated label", () => {
    render(
      <GlucoseHero
        {...defaultProps}
        embedded
        isStale
        readingAgeNow={NOW_MS}
        timestamp={new Date(NOW_MS - 13 * 60_000).toISOString()}
        updatedAt={new Date(NOW_MS - 4_000).toISOString()}
      />,
    );

    expect(screen.getByTestId("glucose-hero-updated-at")).toHaveTextContent(
      "Updated 4s ago",
    );
    expect(screen.getByTestId("glucose-indicator-value")).toHaveTextContent(
      "--",
    );
  });

  it("uses yellow and red updated labels for delayed and stale readings", () => {
    const { rerender } = render(
      <GlucoseHero
        {...defaultProps}
        embedded
        isDelayed
        readingAgeNow={NOW_MS}
        timestamp={new Date(NOW_MS - 7 * 60_000).toISOString()}
      />,
    );

    expect(screen.getByTestId("glucose-hero-updated-at")).toHaveClass(
      "text-signal-warning-text",
    );

    rerender(
      <GlucoseHero
        {...defaultProps}
        embedded
        isStale
        readingAgeNow={NOW_MS}
        timestamp={new Date(NOW_MS - 13 * 60_000).toISOString()}
      />,
    );

    expect(screen.getByTestId("glucose-hero-updated-at")).toHaveTextContent(
      "Updated 13m 0s ago",
    );
    expect(screen.getByTestId("glucose-hero-updated-at")).toHaveClass(
      "text-signal-error-text",
    );
    expect(screen.getByTestId("glucose-hero-updated-at")).not.toHaveClass(
      "text-signal-warning-text",
    );
    expect(screen.getByTestId("glucose-hero-updated-at")).toHaveAttribute(
      "role",
      "alert",
    );
  });

  it("uses the updated label as the stale warning", () => {
    render(
      <GlucoseHero
        {...defaultProps}
        embedded
        isStale
        readingAgeNow={NOW_MS}
        timestamp={new Date(NOW_MS - 13 * 60_000).toISOString()}
      />,
    );

    expect(screen.getByTestId("glucose-hero-updated-at")).toHaveTextContent(
      "Updated 13m 0s ago",
    );
    expect(screen.getByTestId("glucose-hero-updated-at")).toHaveClass(
      "text-signal-error-text",
    );
    expect(screen.getByTestId("glucose-hero-updated-at")).toHaveAttribute(
      "role",
      "alert",
    );
    expect(
      screen.queryByText(/Data is .* minutes old/i),
    ).not.toBeInTheDocument();
  });

  it("uses a controlled clock for the embedded reading age when provided", () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(NOW_MS);

    try {
      render(
        <GlucoseHero
          {...defaultProps}
          embedded
          readingAgeNow={NOW_MS + 3_000}
          timestamp={new Date(NOW_MS - 125_000).toISOString()}
        />,
      );

      expect(screen.getByTestId("glucose-hero-updated-at")).toHaveTextContent(
        "Updated 2m 8s ago",
      );
    } finally {
      nowSpy.mockRestore();
    }
  });
});
