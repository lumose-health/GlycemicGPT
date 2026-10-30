/**
 * Tests for the clinical report's pump-profile segment row (#1039, #1040).
 *
 * The report goes to clinicians: a setting that isn't known must read
 * "Not set", never 0, while a real 0 U/h basal must still show as 0.00.
 */

import { render, screen } from "@testing-library/react";
import { NOT_SET, PumpSegmentRow } from "./PumpSegmentRow";
import type { PumpProfileSegment } from "@/lib/api";

function renderRow(seg: Partial<PumpProfileSegment>, unit: "mgdl" | "mmol" = "mgdl") {
  const full: PumpProfileSegment = {
    time: "12:00 AM",
    start_minutes: 0,
    basal_rate: 0.8,
    correction_factor: 50,
    carb_ratio: 10,
    target_bg: 110,
    ...seg,
  };
  render(
    <table>
      <tbody>
        <PumpSegmentRow seg={full} unit={unit} />
      </tbody>
    </table>,
  );
  return screen.getAllByRole("cell").map((cell) => cell.textContent);
}

describe("clinical report PumpSegmentRow", () => {
  it("renders known values", () => {
    expect(renderRow({})).toEqual(["12:00 AM", "0.80", "10.0", "50", "110"]);
  });

  it("renders null values as Not set", () => {
    expect(
      renderRow({
        basal_rate: null,
        correction_factor: null,
        carb_ratio: null,
        target_bg: null,
      }),
    ).toEqual(["12:00 AM", NOT_SET, NOT_SET, NOT_SET, NOT_SET]);
  });

  it("renders the legacy 0 placeholder for CR, correction and target as Not set", () => {
    expect(
      renderRow({ correction_factor: 0, carb_ratio: 0, target_bg: 0 }),
    ).toEqual(["12:00 AM", "0.80", NOT_SET, NOT_SET, NOT_SET]);
  });

  it("styles Not set cells with a readable (WCAG AA) slate-500, not slate-400", () => {
    renderRow({ carb_ratio: null });
    const cell = screen.getByText(NOT_SET);
    expect(cell).toHaveClass("text-slate-500");
    expect(cell).not.toHaveClass("text-slate-400");
  });

  it("renders a real 0 U/h basal as 0.00", () => {
    expect(renderRow({ basal_rate: 0 })[1]).toBe("0.00");
  });

  it("converts known glucose values in mmol/L and keeps unknowns Not set", () => {
    const cells = renderRow({ correction_factor: 50, target_bg: null }, "mmol");
    expect(cells[3]).toBe("2.8");
    expect(cells[4]).toBe(NOT_SET);
  });
});
