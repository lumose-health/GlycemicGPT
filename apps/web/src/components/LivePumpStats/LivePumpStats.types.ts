export interface LivePumpStatsProps {
  iob: number | null;
  basalRate: number | null;
  batteryPct: number | null;
  reservoirUnits: number | null;
  cobGrams?: number | null;
  className?: string;
}
