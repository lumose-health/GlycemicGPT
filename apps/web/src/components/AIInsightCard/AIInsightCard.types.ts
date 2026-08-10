import type { InsightDetail } from "@/lib/api";

export type AnalysisType =
  | "daily_brief"
  | "meal_analysis"
  | "correction_analysis";

export interface InsightData {
  id: string;
  analysis_type: AnalysisType;
  title: string;
  content: string;
  created_at: string;
  status: "pending" | "acknowledged" | "dismissed";
}

export interface AIInsightCardProps {
  insight: InsightData;
  onRespond?: (
    analysisType: AnalysisType,
    analysisId: string,
    response: "acknowledged" | "dismissed",
    reason?: string,
  ) => Promise<void>;
  onFetchDetail?: (
    analysisType: AnalysisType,
    analysisId: string,
  ) => Promise<InsightDetail>;
}
