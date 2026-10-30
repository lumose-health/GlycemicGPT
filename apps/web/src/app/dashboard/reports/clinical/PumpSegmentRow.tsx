"use client";

import { formatGlucose, type GlucoseUnit } from "@/lib/glucose-units";
import type { PumpProfileSegment } from "@/lib/api";

export const NOT_SET = "Not set";

// A null value means the setting isn't known. Carb ratio, correction factor
// and target are never valid at 0, so a 0 there is the old "not known"
// placeholder and must not reach a clinician as a real setting.
function knownPositive(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

// A 0 U/h basal is a real setting. The API already reports an older
// unknown 0 basal as null.
function formatBasal(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return value.toFixed(2);
}

const CELL =
  "py-1.5 px-2 text-right text-slate-900 dark:text-white print:text-black";
// Muted but still readable: slate-500 on white is about 4.8:1 (WCAG AA).
const NOT_SET_CELL =
  "py-1.5 px-2 text-right text-slate-500 dark:text-slate-400 print:text-slate-600";

function Cell({ text }: { text: string | null }) {
  if (text == null) return <td className={NOT_SET_CELL}>{NOT_SET}</td>;
  return <td className={CELL}>{text}</td>;
}

export function PumpSegmentRow({
  seg,
  unit,
}: {
  seg: PumpProfileSegment;
  unit: GlucoseUnit;
}) {
  const carbRatio = knownPositive(seg.carb_ratio);
  const correction = knownPositive(seg.correction_factor);
  const target = knownPositive(seg.target_bg);

  return (
    <tr className="border-b border-slate-200 dark:border-slate-700 print:border-slate-300">
      <td className="py-1.5 px-2 text-slate-600 dark:text-slate-300 print:text-slate-700 font-medium">
        {seg.time}
      </td>
      <Cell text={formatBasal(seg.basal_rate)} />
      <Cell text={carbRatio != null ? carbRatio.toFixed(1) : null} />
      <Cell text={correction != null ? formatGlucose(correction, unit) : null} />
      <Cell text={target != null ? formatGlucose(target, unit) : null} />
    </tr>
  );
}
