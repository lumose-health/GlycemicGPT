import type { GlucoseUnit } from "@/lib/glucose-units";
import type { TrendDirection } from "@/components/TrendArrow";
import type {
  LoopStatusInfo,
  OverrideInfo,
} from "@/lib/pump/closed-loop-status";

export type {
  LoopState,
  LoopStatusInfo,
  OverrideInfo,
} from "@/lib/pump/closed-loop-status";

export type GlucoseRange =
  | "urgentLow"
  | "low"
  | "inRange"
  | "high"
  | "urgentHigh";

export interface GlucoseHeroProps {
  value: number | null;
  trend: TrendDirection;
  iob: number | null;
  basalRate: number | null;
  batteryPct: number | null;
  reservoirUnits: number | null;
  cobGrams?: number | null;
  loopStatus?: LoopStatusInfo | null;
  override?: OverrideInfo | null;
  unit?: GlucoseUnit;
  timestamp?: string | null;
  readingAgeNow?: number;
  minutesAgo?: number;
  isStale?: boolean;
  isLoading?: boolean;
  embedded?: boolean;
  showPumpStats?: boolean;
  thresholds?: {
    urgentLow: number;
    low: number;
    high: number;
    urgentHigh: number;
  };
}
