import type { ChartZoomChangeHandler } from "@/lib/charts/chart-zoom";
import type {
  InsulinOnBoardSample,
  LongActingBasalInjection,
  PumpActivityInterval,
  PumpBasalSegment,
  PumpSuspensionInterval,
  RapidInsulinDose,
} from "./insulin-timeline-data";

export type InsulinDoseEvent =
  | RapidInsulinDose
  | LongActingBasalInjection;

export interface ExpandedTimelineHover {
  timestamp: number;
  doses: InsulinDoseEvent[];
  insulinOnBoardSample?: InsulinOnBoardSample | null;
}

export interface SharedTimelineProps {
  cursorSyncKey: string;
  multiDay: boolean;
  onHoverChange: (hover: ExpandedTimelineHover | null) => void;
  onZoomChange: ChartZoomChangeHandler;
  sectionHeaderSeparator?: boolean;
  showXAxis: boolean;
  xDomain: [number, number];
}

export interface DoseTimelineProps extends SharedTimelineProps {
  error: string | null;
  isLoading: boolean;
  longActingBasalInjections: LongActingBasalInjection[];
  onRetry: () => void;
  rapidDoses: RapidInsulinDose[];
}

export interface BasalRateTimelineProps extends SharedTimelineProps {
  error: string | null;
  isLoading: boolean;
  isPossiblyTruncated: boolean;
  onRetry: () => void;
  segments: PumpBasalSegment[];
}

export interface InsulinOnBoardTimelineProps extends SharedTimelineProps {
  samples: InsulinOnBoardSample[];
}

export interface ActivityModeTimelineProps extends SharedTimelineProps {
  intervals: PumpActivityInterval[];
  suspensionIntervals: PumpSuspensionInterval[];
}
