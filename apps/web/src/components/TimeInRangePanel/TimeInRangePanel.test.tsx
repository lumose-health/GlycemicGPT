import { render, screen, within } from "@testing-library/react";
import { TimeInRangePanel } from "@/components/TimeInRangePanel";
import type { TirBucket } from "@/lib/api";

const buckets: TirBucket[] = [
  {
    label: "urgent_low",
    pct: 1,
    readings: 2,
    threshold_low: null,
    threshold_high: 54,
  },
  {
    label: "low",
    pct: 4,
    readings: 8,
    threshold_low: 55,
    threshold_high: 69,
  },
  {
    label: "in_range",
    pct: 72,
    readings: 144,
    threshold_low: 70,
    threshold_high: 180,
  },
  {
    label: "high",
    pct: 18,
    readings: 36,
    threshold_low: 181,
    threshold_high: 250,
  },
  {
    label: "urgent_high",
    pct: 5,
    readings: 10,
    threshold_low: 251,
    threshold_high: null,
  },
];

const previousBuckets: TirBucket[] = buckets.map((bucket) =>
  bucket.label === "in_range" ? { ...bucket, pct: 64 } : bucket,
);

const baseProps = {
  buckets,
  readingsCount: 200,
  previousBuckets,
  previousReadingsCount: 180,
  error: null,
  isLoading: false,
};

describe("TimeInRangePanel", () => {
  it("renders inside the shared Panel with circular bucket diagrams", () => {
    render(<TimeInRangePanel {...baseProps} />);

    const panel = screen.getByRole("region", { name: "Time in Range" });

    expect(panel).toHaveClass("rounded-panel", "bg-surface-elevated");
    expect(
      within(panel).getByRole("heading", {
        level: 2,
        name: "Time in Range",
      }),
    ).toBeInTheDocument();
    expect(within(panel).queryByText("Last 24 hours")).not.toBeInTheDocument();
    expect(within(panel).getByText("Excellent")).toHaveClass(
      "text-signal-check-text",
    );
    expect(within(panel).getByTestId("time-in-range-delta")).toHaveTextContent(
      "+8%",
    );
    expect(
      within(panel).getByRole("img", {
        name: "In range: 72%",
      }),
    ).toHaveClass("text-signal-check-fill", "max-w-48", "w-full");
    expect(
      within(panel).getByRole("img", {
        name: "High: 18%",
      }),
    ).toHaveClass("text-signal-warning-fill", "max-w-28");
    expect(
      within(panel).getByRole("img", {
        name: "Urgent high: 5%",
      }),
    ).toHaveClass("text-signal-error-fill", "max-w-[4.5rem]");
    expect(within(panel).queryByText("Target: 70-180 mg/dL")).not.toBeInTheDocument();
    expect(
      within(panel).getByText("200 readings compared with 180 previous"),
    ).toBeInTheDocument();
  });

  it("renders loading, error, and empty states", () => {
    const { rerender } = render(<TimeInRangePanel {...baseProps} isLoading />);

    expect(
      screen.getByRole("status", { name: "Loading time in range data" }),
    ).toBeInTheDocument();

    rerender(<TimeInRangePanel {...baseProps} error="Unable to load" />);

    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load");

    rerender(
      <TimeInRangePanel
        {...baseProps}
        buckets={null}
        previousBuckets={null}
        readingsCount={0}
      />,
    );

    expect(screen.getByTestId("time-in-range-panel-empty")).toHaveTextContent(
      "No glucose data available for this period.",
    );
  });

  it("treats an empty current bucket array as unavailable", () => {
    render(
      <TimeInRangePanel
        {...baseProps}
        buckets={[]}
        readingsCount={200}
      />,
    );

    expect(screen.getByTestId("time-in-range-panel-empty")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /In range/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("time-in-range-delta")).not.toBeInTheDocument();
  });

  it("does not calculate a comparison from an empty previous bucket array", () => {
    render(
      <TimeInRangePanel
        {...baseProps}
        previousBuckets={[]}
        previousReadingsCount={0}
      />,
    );

    expect(screen.getByTestId("time-in-range-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("time-in-range-delta")).not.toBeInTheDocument();
  });
});
