/**
 * Tests for the clinical report's `BolusTable` (GLY-270).
 *
 * Mirrors the guard test in BolusReviewTable.test.tsx and
 * dashboard/bolus-review-table.tsx: an unrecognized `event_type` must never
 * render as a real insulin dose in the clinician-facing report.
 */

import { render, screen } from "@testing-library/react";
import { BolusTable } from "./BolusTable";
import type { BolusReviewItem } from "@/lib/api";

function makeBoluses(): BolusReviewItem[] {
  return [
    {
      event_timestamp: "2026-03-01T14:30:00Z",
      event_type: "bolus",
      units: 3.5,
      is_automated: false,
      control_iq_reason: null,
      pump_activity_mode: null,
      iob_at_event: 2.1,
      bg_at_event: 185,
    },
    {
      event_timestamp: "2026-03-01T12:00:00Z",
      event_type: "correction",
      units: 0.8,
      is_automated: true,
      control_iq_reason: "Correction",
      pump_activity_mode: null,
      iob_at_event: 1.5,
      bg_at_event: 210,
    },
  ];
}

describe("clinical report BolusTable", () => {
  it("never renders a row with an unrecognized event_type as a dose (GLY-270)", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const boluses: BolusReviewItem[] = [
      {
        event_timestamp: "2026-03-01T07:00:00Z",
        event_type: "closed_loop_micro_dose",
        units: 0.5,
        is_automated: true,
        control_iq_reason: null,
        pump_activity_mode: null,
        iob_at_event: 1.3,
        bg_at_event: 142,
      },
      ...makeBoluses(),
    ];

    render(<BolusTable boluses={boluses} totalCount={boluses.length} />);

    expect(screen.queryByText("0.50 U")).not.toBeInTheDocument();
    expect(screen.getByText("3.50 U")).toBeInTheDocument();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("closed_loop_micro_dose"),
    );

    warnSpy.mockRestore();
  });

  it("shows a distinct message (not the no-data message) when every row is filtered out", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    render(
      <BolusTable
        boluses={[
          {
            event_timestamp: "2026-03-01T07:00:00Z",
            event_type: "device_event",
            units: 42,
            is_automated: false,
            control_iq_reason: null,
            pump_activity_mode: null,
            iob_at_event: null,
            bg_at_event: null,
          },
        ]}
        totalCount={1}
      />,
    );

    expect(
      screen.getByText("1 bolus event could not be displayed."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No bolus events for this period."),
    ).not.toBeInTheDocument();

    warnSpy.mockRestore();
  });

  it("shows the true no-data message when there are no bolus events at all", () => {
    render(<BolusTable boluses={[]} totalCount={0} />);

    expect(
      screen.getByText("No bolus events for this period."),
    ).toBeInTheDocument();
  });

  it("shows a truncation notice measured against the known-row count", () => {
    render(<BolusTable boluses={makeBoluses()} totalCount={150} />);
    expect(
      screen.getByText(/Showing most recent 2 of 150 bolus/),
    ).toBeInTheDocument();
  });
});
