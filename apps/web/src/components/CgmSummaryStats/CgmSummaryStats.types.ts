import type { StatsPeriod } from "@/hooks/use-glucose-stats";
import type { GlucoseStats } from "@/lib/api";
import type { GlucoseUnit } from "@/lib/glucose-units";
import type { TimeInRangePanelContentProps } from "@/components/TimeInRangePanel";

export interface CgmSummaryStatsProps {
  stats: GlucoseStats | null;
  isLoading: boolean;
  error?: string | null;
  period: StatsPeriod;
  onPeriodChange?: (period: StatsPeriod) => void;
  className?: string;
  unit?: GlucoseUnit;
  timeInRange?: TimeInRangePanelContentProps;
}
