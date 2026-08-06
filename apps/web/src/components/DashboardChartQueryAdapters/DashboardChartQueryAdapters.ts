import {
  useDashboardBolusReview,
  useDashboardGlucoseHistory,
  useDashboardInsulinSummary,
  useDashboardPumpEvents,
} from "@/hooks/dashboard-query";
import { useBolusReview } from "@/hooks/use-bolus-review";
import { useGlucoseHistory } from "@/hooks/use-glucose-history";
import { useInsulinSummary } from "@/hooks/use-insulin-summary";
import { usePumpEvents } from "@/hooks/use-pump-events";

interface QueryTransitionState {
  hasBackgroundError: boolean;
  isPreviousData: boolean;
  isUpdating: boolean;
}

type GlucoseHistoryResult = ReturnType<typeof useGlucoseHistory> &
  QueryTransitionState;
type BolusReviewResult = ReturnType<typeof useBolusReview> &
  QueryTransitionState;
type PumpEventsResult = ReturnType<typeof usePumpEvents> & QueryTransitionState;
type InsulinSummaryResult = ReturnType<typeof useInsulinSummary> &
  QueryTransitionState;

function useLegacyGlucoseHistoryAdapter(
  ...args: Parameters<typeof useDashboardGlucoseHistory>
): GlucoseHistoryResult {
  return {
    ...useGlucoseHistory(...args),
    hasBackgroundError: false,
    isPreviousData: false,
    isUpdating: false,
  };
}

function useLegacyBolusReviewAdapter(
  ...args: Parameters<typeof useDashboardBolusReview>
): BolusReviewResult {
  return {
    ...useBolusReview(...args),
    hasBackgroundError: false,
    isPreviousData: false,
    isUpdating: false,
  };
}

function useLegacyPumpEventsAdapter(
  ...args: Parameters<typeof useDashboardPumpEvents>
): PumpEventsResult {
  return {
    ...usePumpEvents(...args),
    hasBackgroundError: false,
    isPreviousData: false,
    isUpdating: false,
  };
}

function useLegacyInsulinSummaryAdapter(
  ...args: Parameters<typeof useDashboardInsulinSummary>
): InsulinSummaryResult {
  return {
    ...useInsulinSummary(...args),
    hasBackgroundError: false,
    isPreviousData: false,
    isUpdating: false,
  };
}

export interface DashboardChartQueryAdapter {
  useBolusReview: (
    ...args: Parameters<typeof useDashboardBolusReview>
  ) => BolusReviewResult;
  useGlucoseHistory: (
    ...args: Parameters<typeof useDashboardGlucoseHistory>
  ) => GlucoseHistoryResult;
  useInsulinSummary: (
    ...args: Parameters<typeof useDashboardInsulinSummary>
  ) => InsulinSummaryResult;
  usePumpEvents: (
    ...args: Parameters<typeof useDashboardPumpEvents>
  ) => PumpEventsResult;
}

export const legacyDashboardChartQueryAdapter: DashboardChartQueryAdapter = {
  useBolusReview: useLegacyBolusReviewAdapter,
  useGlucoseHistory: useLegacyGlucoseHistoryAdapter,
  useInsulinSummary: useLegacyInsulinSummaryAdapter,
  usePumpEvents: useLegacyPumpEventsAdapter,
};

export const v2DashboardChartQueryAdapter: DashboardChartQueryAdapter = {
  useBolusReview: useDashboardBolusReview,
  useGlucoseHistory: useDashboardGlucoseHistory,
  useInsulinSummary: useDashboardInsulinSummary,
  usePumpEvents: useDashboardPumpEvents,
};
