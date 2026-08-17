import type { GlucoseUnit } from "@/lib/glucose-units";
import type {
  GlucoseThresholds,
} from "@/lib/glucose-classification";
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

export type { GlucoseRange } from "@/lib/glucose-classification";

export interface GlucoseHeroProps {
  value: number | null;
  previousValue?: number | null;
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
  updatedAt?: string | null;
  readingAgeNow?: number;
  isDelayed?: boolean;
  isStale?: boolean;
  isLoading?: boolean;
  embedded?: boolean;
  showPumpStats?: boolean;
  thresholds?: GlucoseThresholds;
}
