import type { GlucoseUnit } from "@/lib/glucose-units";

export interface AgpChartProps {
  className?: string;
  thresholds?: {
    urgentLow: number;
    low: number;
    high: number;
    urgentHigh: number;
  };
  unit?: GlucoseUnit;
}

export interface AgpChartPoint {
  hour: number;
  label: string;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  count: number;
}
