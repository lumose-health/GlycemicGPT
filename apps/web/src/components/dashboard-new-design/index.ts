/**
 * Dashboard New Design Components
 *
 * Barrel export for the isolated dashboard redesign surface.
 */
export { Banner, type BannerProps } from"./Banner";
export {
  GlucoseHero,
  type GlucoseHeroProps,
  type GlucoseRange,
  type LoopState,
  type LoopStatusInfo,
  type OverrideInfo,
  classifyGlucose,
  shouldPulse,
  parseLoopState,
  prettySourceName,
  formatOverrideRemaining,
  GLUCOSE_THRESHOLDS,
} from"./glucose-hero";
export {
  TrendArrow,
  type TrendArrowProps,
  type TrendDirection,
  type TrendArrowSize,
  TREND_ARROWS,
  TREND_DESCRIPTIONS,
  getTrendArrow,
  getTrendDescription,
  isRising,
  isFalling,
  isRapidChange,
  isStable,
  isUnknown,
} from"./trend-arrow";
export {
  TimeInRangeBar,
  type TimeInRangeBarProps,
  type TimePeriod,
  normalizeBuckets,
  formatPercentage,
  getQualityAssessment,
  PERIOD_LABELS,
} from"./time-in-range-bar";
export {
  TimeInRangePanel,
  type TimeInRangePanelProps,
} from"./time-in-range-panel";
export {
  ConnectionStatusBanner,
  type ConnectionStatusBannerProps,
} from"./connection-status-banner";
export { GlucoseUnitSeedNotice } from"./glucose-unit-seed-notice";
export {
  AIInsightCard,
  type AIInsightCardProps,
  type InsightData,
} from"./ai-insight-card";
export { AlertCard, type AlertCardProps } from"./alert-card";
export { EscalationTimeline } from"./escalation-timeline";
export {
  GlucoseTrendChart,
  type GlucoseTrendChartProps,
  getPointColor,
  PERIOD_TO_MS,
} from"./glucose-trend-chart";
export { DashboardTimeRangePicker } from"./DashboardTimeRangePicker";
export {
  DashboardTimeRangeProvider,
  useDashboardTimeRange,
  useOptionalDashboardTimeRange,
} from"./dashboard-time-range-context";
export {
  CgmSummaryStats,
  type CgmSummaryStatsProps,
} from"./cgm-summary-stats";
export {
  AgpChart,
  type AgpChartProps,
  transformBuckets,
  formatHour,
} from"./agp-chart";
export {
  InsulinSummaryStats,
  type InsulinSummaryStatsProps,
} from"./insulin-summary-stats";
export {
  BolusReviewTable,
  type BolusReviewTableProps,
} from"./bolus-review-table";
export { DataSourcesFreshnessCard } from"./data-sources-freshness-card";
export {
  LivePumpStats,
  getLivePumpStatsMetrics,
  type LivePumpStatsProps,
} from"./live-pump-stats";
export {
  DashboardSidebarLink,
  type DashboardSidebarLinkProps,
} from"./DashboardSidebarLink";
export { DashboardLayout } from"./dashboard-layout";
export { Sidebar, MobileNav } from"./sidebar";
export { AnimatedCard } from"./animated-card";
export { PageTransition } from"./page-transition";
