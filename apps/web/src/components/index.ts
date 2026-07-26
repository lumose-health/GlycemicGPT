/**
 * Product dashboard components
 *
 * Barrel export for the isolated dashboard redesign surface.
 */
export { Banner, type BannerProps, type BannerTheme } from "./Banner";
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
} from "./GlucoseHero";
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
} from "./TrendArrow";
export {
  TimeInRangeBar,
  type TimeInRangeBarProps,
  type TimePeriod,
  normalizeBuckets,
  formatPercentage,
  getQualityAssessment,
  PERIOD_LABELS,
} from "./TimeInRangeBar";
export {
  TimeInRangePanel,
  type TimeInRangePanelProps,
} from "./TimeInRangePanel";
export {
  ConnectionStatusBanner,
  type ConnectionStatusBannerProps,
} from "./ConnectionStatusBanner";
export { AlertToast, type AlertToastProps } from "./AlertToast";
export { GlucoseUnitSeedNotice } from "./GlucoseUnitSeedNotice";
export {
  ChartSectionHeader,
  type ChartSectionHeaderProps,
} from "./ChartSectionHeader";
export {
  ChartLegendSwatch,
  type ChartLegendSwatchProps,
} from "./ChartLegendSwatch";
export {
  AIInsightCard,
  type AIInsightCardProps,
  type InsightData,
} from "./AIInsightCard";
export { AlertCard, type AlertCardProps } from "./AlertCard";
export {
  EscalationTimeline,
  type EscalationTimelineProps,
} from "./EscalationTimeline";
export {
  GlucoseTrendChart,
  type GlucoseTrendChartProps,
  getPointColor,
  PERIOD_TO_MS,
} from "./GlucoseTrendChart";
export {
  MergedGlucoseTrendChart,
  MobileMergedGlucoseTrendChart,
  DesktopMergedGlucoseTrendChart,
  type MergedChartModel,
  type MergedGlucoseTrendChartProps,
} from "./MergedGlucoseTrendChart";
export {
  DashboardTimeRangePicker,
  DashboardTimeRangeQuickSelect,
  type DashboardTimeRangePickerProps,
  type DashboardTimeRangeQuickSelectProps,
} from "./DashboardTimeRangePicker";
export {
  DashboardTimeRangeProvider,
  useDashboardTimeRange,
  useOptionalDashboardTimeRange,
} from "./DashboardTimeRangeProvider";
export { CgmSummaryStats, type CgmSummaryStatsProps } from "./CgmSummaryStats";
export {
  AgpChart,
  type AgpChartProps,
  transformBuckets,
  formatHour,
} from "./AgpChart";
export {
  InsulinSummaryStats,
  type InsulinSummaryStatsProps,
} from "./InsulinSummaryStats";
export {
  BolusReviewTable,
  type BolusReviewTableProps,
} from "./BolusReviewTable";
export {
  DataSourcesFreshnessCard,
  type DataSourcesFreshnessCardProps,
} from "./DataSourcesFreshnessCard";
export {
  LivePumpStats,
  getLivePumpStatsMetrics,
  type LivePumpStatsProps,
} from "./LivePumpStats";
export {
  DashboardSidebarLink,
  type DashboardSidebarLinkProps,
} from "./DashboardSidebarLink";
export { LumoseLogo, type LumoseLogoProps } from "./LumoseLogo";
export { MobileNav } from "./MobileNav";
export { Sidebar, type SidebarProps } from "./Sidebar";
export {
  SidebarAccountControls,
  type SidebarAccountControlsProps,
} from "./SidebarAccountControls";
export {
  SidebarBackToAppRegion,
  type SidebarBackToAppRegionProps,
} from "./SidebarBackToAppRegion";
export {
  SidebarNavigationItems,
  type SidebarNavigationItemsProps,
} from "./SidebarNavigationItems";
export { UnreadBadge, type UnreadBadgeProps } from "./UnreadBadge";
export { AnimatedCard, type AnimatedCardProps } from "./AnimatedCard";
export { PageTransition, type PageTransitionProps } from "./PageTransition";
export { InsulinTimeline, type InsulinTimelineProps } from "./InsulinTimeline";
