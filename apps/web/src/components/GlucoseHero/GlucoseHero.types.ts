import type { GlucoseUnit } from "@/lib/glucose-units";
import type { TrendDirection } from "@/components/TrendArrow";

export type GlucoseRange =
  | "urgentLow"
  | "low"
  | "inRange"
  | "high"
  | "urgentHigh";

export type LoopState = "looping" | "not_looping" | "failed";

export interface LoopStatusInfo {
  state: LoopState;
  source: string;
  issuedAt: string;
  failureReason?: string | null;
}

export interface OverrideInfo {
  name: string;
  startedAt: string;
  endsAt?: string | null;
  multiplier?: number | null;
  targetLowMgdl?: number | null;
  targetHighMgdl?: number | null;
}

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
