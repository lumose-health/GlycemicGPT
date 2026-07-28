/**
 * Product dashboard components
 *
 * Barrel export for the isolated dashboard redesign surface.
 */
export { Banner, type BannerProps, type BannerTheme } from "./Banner";
export { ActionLink, type ActionLinkProps } from "./ActionLink";
export { ContentPage, type ContentPageProps } from "./ContentPage";
export { CommonFoodCard, type CommonFoodCardProps } from "./CommonFoodCard";
export {
  FeedbackMessage,
  type FeedbackMessageProps,
  type FeedbackMessageVariant,
} from "./FeedbackMessage";
export {
  HighlightButton,
  type HighlightButtonProps,
  type HighlightButtonSize,
} from "./HighlightButton";
export {
  PrimaryButton,
  type PrimaryButtonProps,
  type PrimaryButtonSize,
} from "./PrimaryButton";
export {
  SaveButton,
  type SaveButtonProps,
  type SaveButtonState,
} from "./SaveButton";
export {
  SecondaryButton,
  type SecondaryButtonProps,
  type SecondaryButtonSize,
} from "./SecondaryButton";
export {
  SelectField,
  type SelectFieldOption,
  type SelectFieldProps,
} from "./SelectField";
export { TextInput, type TextInputProps } from "./TextInput";
export {
  DestructiveButton,
  type DestructiveButtonProps,
} from "./DestructiveButton";
export { EmptyState, type EmptyStateProps } from "./EmptyState";
export { LoadingState, type LoadingStateProps } from "./LoadingState";
export {
  KnowledgeDocumentCard,
  KNOWLEDGE_TIERS,
  getKnowledgeTierLabel,
  getKnowledgeTierVariant,
  type KnowledgeDocumentCardProps,
} from "./KnowledgeDocumentCard";
export {
  MarkdownContent,
  type MarkdownContentProps,
} from "./MarkdownContent";
export {
  GroundedSourceNote,
  MealAssumedPortion,
  MealComorbidityNutrition,
  MealErrorPanel,
  MealGroundingStatus,
  MealIdentityConfirmedBadge,
  MealNutritionDisclaimer,
  MealNutritionFacts,
  MealPhotoPlaceholder,
  MealSafetyQualifier,
  MealSourceBadge,
} from "./MealDetails";
export { MealCard, type MealCardProps } from "./MealCard";
export {
  MealCorrectionSection,
  MealIdentitySection,
  type MealEditorProps,
} from "./MealEditor";
export {
  MealCommonFoodSection,
  type MealCommonFoodSectionProps,
} from "./MealCommonFoodSection";
export {
  MealAuditPanel,
  type MealAuditPanelProps,
} from "./MealAuditPanel";
export { MealPhoto, type MealPhotoProps } from "./MealPhoto";
export { MealUpload, type MealUploadProps } from "./MealUpload";
export { PageHeader, type PageHeaderProps } from "./PageHeader";
export { Pagination, type PaginationProps } from "./Pagination";
export {
  Panel,
  type PanelHeadingLevel,
  type PanelProps,
} from "./Panel";
export {
  SegmentedControl,
  type SegmentedControlOption,
  type SegmentedControlProps,
} from "./SegmentedControl";
export { TextAreaField, type TextAreaFieldProps } from "./TextAreaField";
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
