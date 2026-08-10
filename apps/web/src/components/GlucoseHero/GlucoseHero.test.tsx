import { render, screen } from "@testing-library/react";
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
        "right-4",
        "top-4",
        "text-right",
        "text-foreground-primary/70",
      );
      expect(screen.getByTestId("glucose-hero-updated-at")).not.toHaveClass(
        "text-signal-warning-text",
      );
    } finally {
      nowSpy.mockRestore();
    }
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
      "text-signal-warning-text",
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
