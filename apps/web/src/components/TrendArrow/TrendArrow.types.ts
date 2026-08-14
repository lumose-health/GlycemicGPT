export type TrendDirection =
  | "RisingFast"
  | "Rising"
  | "Stable"
  | "Falling"
  | "FallingFast"
  | "Unknown";

export type TrendArrowSize = "sm" | "md" | "lg" | "xl";

export interface TrendArrowProps {
  direction: TrendDirection;
  size?: TrendArrowSize;
  colorClass?: string;
  useTrendColor?: boolean;
  decorative?: boolean;
  animated?: boolean;
  className?: string;
}
