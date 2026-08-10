import type { ChartTimePeriod } from "@/lib/chart-periods";

export type TimeRange = ChartTimePeriod;

export const GLUCOSE_TIME_RANGES: { key: TimeRange; label: string; hours: number }[] = [
  { key: "3h", label: "3 hours", hours: 3 },
  { key: "6h", label: "6 hours", hours: 6 },
  { key: "12h", label: "12 hours", hours: 12 },
  { key: "24h", label: "24 hours", hours: 24 },
  { key: "3d", label: "3 days", hours: 72 },
  { key: "7d", label: "7 days", hours: 168 },
  { key: "14d", label: "14 days", hours: 336 },
  { key: "30d", label: "30 days", hours: 720 },
];

export function getTimeRangeHours(range: string | null | undefined): number | null {
  if (!range) {
    return null;
  }

  return GLUCOSE_TIME_RANGES.find((item) => item.key === range)?.hours ?? null;
}
