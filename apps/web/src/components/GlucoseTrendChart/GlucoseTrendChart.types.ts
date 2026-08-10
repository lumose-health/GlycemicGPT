import type { ForecastReadResponse } from "@/lib/api";
import type { GlucoseUnit } from "@/lib/glucose-units";
import type { GlucoseThresholds } from "@/lib/glucose-classification";

export interface GlucoseTrendChartProps {
  refreshKey?: number;
  className?: string;
  hasConfiguredPump?: boolean;
  thresholds?: GlucoseThresholds;
  forecast?: ForecastReadResponse | null;
  unit?: GlucoseUnit;
  embedded?: boolean;
}
