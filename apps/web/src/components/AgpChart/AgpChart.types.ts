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
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  count: number;
}
