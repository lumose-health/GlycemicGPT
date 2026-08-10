import type { ForecastReadResponse } from "@/lib/api";

export interface GlucoseForecastAnchor {
  timestampMs: number;
  valueMgDl: number;
}

export interface GlucoseForecastPoint {
  timestampMs: number;
  valueMgDl: number;
}

export interface GlucoseForecastLegendProps {
  eligible: boolean;
  forecast: ForecastReadResponse | null | undefined;
  points: readonly GlucoseForecastPoint[];
}
