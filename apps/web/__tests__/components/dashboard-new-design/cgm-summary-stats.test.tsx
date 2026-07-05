import { render, screen, within } from "@testing-library/react";
import { CgmSummaryStats } from "@/components/dashboard-new-design/cgm-summary-stats";
import type { GlucoseStats } from "@/lib/api";

const stats: GlucoseStats = {
  mean_glucose: 154,
  std_dev: 38,
  min_glucose: 69,
  max_glucose: 241,
  cv_pct: 24.7,
  gmi: 7,
  cgm_active_pct: 92,
  readings_count: 288,
  period_minutes: 1440,
};

describe("dashboard-new-design CgmSummaryStats", () => {
  it("renders inside the shared panel without the time range label or readings metric", () => {
    render(
      <CgmSummaryStats
        stats={stats}
        isLoading={false}
        period="24h"
        unit="mgdl"
      />,
    );

    const panel = screen.getByRole("region", { name: "CGM Summary" });
    const heading = within(panel).getByRole("heading", { name: "CGM Summary" });

    expect(panel).toBeInTheDocument();
    expect(heading.querySelector("svg")).not.toBeInTheDocument();
    expect(within(panel).queryByText("Last 24 hours")).not.toBeInTheDocument();
    expect(within(panel).queryByText("Readings")).not.toBeInTheDocument();
  });

  it("shows average, min, and max glucose in one grouped box", () => {
    render(
      <CgmSummaryStats
        stats={stats}
        isLoading={false}
        period="24h"
        unit="mgdl"
      />,
    );

    const glucoseGroup = screen.getByRole("group", {
      name: "Glucose summary values",
    });
    const average = within(glucoseGroup).getByRole("group", {
      name: "Average glucose: 154 mg/dL",
    });
    expect(within(average).getByText("Avg Glucose")).toBeInTheDocument();
    expect(within(average).getByText("154")).toBeInTheDocument();

    expect(
      within(glucoseGroup).getByRole("group", { name: "Minimum glucose: 69 mg/dL" }),
    ).toHaveTextContent(/Min Glucose\s*69\s*mg\/dL/);
    expect(
      within(glucoseGroup).getByRole("group", { name: "Maximum glucose: 241 mg/dL" }),
    ).toHaveTextContent(/Max Glucose\s*241\s*mg\/dL/);
  });

  it("keeps target context visible for clinical status values", () => {
    render(
      <CgmSummaryStats
        stats={stats}
        isLoading={false}
        period="24h"
        unit="mgdl"
      />,
    );

    const cv = screen.getByRole("group", {
      name: "Coefficient of variation: 24.7 percent. Stable",
    });
    expect(within(cv).getByText("Target <36%")).toBeInTheDocument();
    expect(within(cv).getByText("Stable")).toBeInTheDocument();

    const cgmActive = screen.getByRole("group", {
      name: "CGM active time: 92 percent. Good coverage",
    });
    expect(within(cgmActive).getByText("Target >70%")).toBeInTheDocument();
    expect(within(cgmActive).getByText("Good coverage")).toBeInTheDocument();
  });
});
