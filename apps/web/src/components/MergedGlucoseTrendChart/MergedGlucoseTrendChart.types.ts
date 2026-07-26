import type { GlucoseUnit } from "@/lib/glucose-units";
import type { TrendDirection } from "@/components/TrendArrow";
import type {
  LongActingBasalInjection,
  PumpActivityInterval,
  PumpBasalSegment,
  PumpSuspensionInterval,
  RapidInsulinDose,
} from "@/components/InsulinTimeline/insulin-timeline-data";

export interface MergedGlucoseTrendChartProps {
  className?: string;
  hasConfiguredPump?: boolean;
  refreshKey?: number;
  thresholds?: {
    urgentLow: number;
    low: number;
    high: number;
    urgentHigh: number;
  };
  unit?: GlucoseUnit;
}

export interface MergedGlucosePoint {
  timestampMs: number;
  trend: TrendDirection;
  valueMgDl: number;
}

export type MergedDoseEvent = RapidInsulinDose | LongActingBasalInjection;

export type MergedActivityKind = "sleep" | "exercise" | "suspension";

export interface MergedChartStatus {
  error: string | null;
  isLoading: boolean;
  label: string;
  onRetry: () => void;
}

export interface MergedChartModel {
  activityIntervals: PumpActivityInterval[];
  basalSegments: PumpBasalSegment[];
  doses: MergedDoseEvent[];
  fullDomain: [number, number];
  hasPump: boolean;
  isMultiDay: boolean;
  points: MergedGlucosePoint[];
  statuses: MergedChartStatus[];
  suspensionIntervals: PumpSuspensionInterval[];
  thresholds: {
    urgentLow: number;
    low: number;
    high: number;
    urgentHigh: number;
  };
  unit: GlucoseUnit;
}

export interface MergedDoseMarkerLayout {
  event: MergedDoseEvent;
  left: number;
  row: number;
}

export interface MergedChartRendererProps {
  className?: string;
  model: MergedChartModel;
}
