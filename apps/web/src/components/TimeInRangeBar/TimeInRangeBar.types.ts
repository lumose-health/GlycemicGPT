import type { TirBucket } from "@/lib/api";

export type TimePeriod = "24h" | "3d" | "7d" | "14d" | "30d";

export interface TimeInRangeBarProps {
  buckets: TirBucket[] | null;
  readingsCount: number;
  previousBuckets: TirBucket[] | null;
  previousReadingsCount: number | null;
  error: string | null;
  period?: TimePeriod;
  periodLabel?: string;
  targetRange?: string;
  isLoading?: boolean;
  onPeriodChange?: (period: TimePeriod) => void;
  className?: string;
}
