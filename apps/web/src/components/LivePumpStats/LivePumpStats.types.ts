import type {
  LoopStatusInfo,
  OverrideInfo,
} from "@/lib/pump/closed-loop-status";

export interface LivePumpStatsProps {
  iob: number | null;
  basalRate: number | null;
  batteryPct: number | null;
  reservoirUnits: number | null;
  cobGrams?: number | null;
  loopStatus?: LoopStatusInfo | null;
  override?: OverrideInfo | null;
  className?: string;
}
