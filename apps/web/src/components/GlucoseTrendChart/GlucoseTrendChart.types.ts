import type { ForecastReadResponse } from "@/lib/api";
import type { GlucoseUnit } from "@/lib/glucose-units";

export interface GlucoseTrendChartProps {
  refreshKey?: number;
  className?: string;
  hasConfiguredPump?: boolean;
  thresholds?: {
    urgentLow: number;
    low: number;
    high: number;
    urgentHigh: number;
  };
  forecast?: ForecastReadResponse | null;
  unit?: GlucoseUnit;
  embedded?: boolean;
}
