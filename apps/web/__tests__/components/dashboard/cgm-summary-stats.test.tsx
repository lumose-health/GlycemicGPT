/**
 * Glucose-unit conversion on the CGM summary: mean and SD convert (SD scaled by
 * /18.0156 like a value, keeping mmol precision); CV%/GMI stay percentages.
 */

import { render, screen, within } from "@testing-library/react";
import { CgmSummaryStats } from "@/components/CgmSummaryStats";
import type { GlucoseStats } from "@/lib/api";

const stats: GlucoseStats = {
  mean_glucose: 180,
  std_dev: 36,
  min_glucose: 72,
  max_glucose: 241,
  cv_pct: 20,
  gmi: 7.0,
  cgm_active_pct: 90,
  readings_count: 288,
  period_minutes: 1440,
};

describe("CgmSummaryStats glucose unit", () => {
  it("shows mean + SD in mg/dL by default", () => {
    render(
      <CgmSummaryStats
        stats={stats}
        isLoading={false}
        period="24h"
        onPeriodChange={jest.fn()}
      />,
    );
    const mean = screen.getByRole("group", {
      name: "Average glucose: 180 mg/dL",
    });
    const standardDeviation = screen.getByRole("group", {
      name: "Standard deviation: 36 mg/dL",
    });

    expect(mean).toHaveTextContent(/180\s*mg\/dL/);
    expect(standardDeviation).toHaveTextContent(/36\s*mg\/dL/);
  });

  it("converts glucose metrics to mmol (CV%/GMI stay percentages)", () => {
    render(
      <CgmSummaryStats
        stats={stats}
        isLoading={false}
        period="24h"
        onPeriodChange={jest.fn()}
        unit="mmol"
      />,
    );
    const glucoseGroup = screen.getByRole("group", {
      name: "Glucose summary values",
    });
    const mean = within(glucoseGroup).getByRole("group", {
      name: "Average glucose: 10.0 mmol/L",
    });
    const minimum = within(glucoseGroup).getByRole("group", {
      name: "Minimum glucose: 4.0 mmol/L",
    });
    const maximum = within(glucoseGroup).getByRole("group", {
      name: "Maximum glucose: 13.4 mmol/L",
    });
    const standardDeviation = screen.getByRole("group", {
      name: "Standard deviation: 2.0 mmol/L",
    });

    expect(mean).toHaveTextContent(/10\.0\s*mmol\/L/);
    expect(minimum).toHaveTextContent(/4\.0\s*mmol\/L/);
    expect(maximum).toHaveTextContent(/13\.4\s*mmol\/L/);
    expect(standardDeviation).toHaveTextContent(/2\.0\s*mmol\/L/);
    // CV% and GMI are percentages, never converted.
    expect(
      screen.getByRole("group", {
        name: "Coefficient of variation: 20.0 percent. Stable",
      }),
    ).toHaveTextContent("20.0%");
    expect(
      screen.getByRole("group", {
        name: "Glucose Management Indicator: 7.0 percent estimated A1C",
      }),
    ).toHaveTextContent("7.0%");
  });
});
