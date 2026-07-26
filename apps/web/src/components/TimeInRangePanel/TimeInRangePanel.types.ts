import type { TirBucket } from "@/lib/api";

export interface TimeInRangePanelProps {
  buckets: TirBucket[] | null;
  readingsCount: number;
  previousBuckets: TirBucket[] | null;
  previousReadingsCount: number | null;
  error: string | null;
  isLoading?: boolean;
  className?: string;
}

export type TimeInRangePanelContentProps = Omit<
  TimeInRangePanelProps,
  "className"
>;
