import type { GlucoseUnit } from "@/lib/glucose-units";
import type { GlucoseThresholds } from "@/lib/glucose-classification";

export interface AgpChartProps {
  className?: string;
  thresholds?: GlucoseThresholds;
  unit?: GlucoseUnit;
}

export interface AgpChartPoint {
  hour: number;
  label: string;
  p10: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  count: number;
}
