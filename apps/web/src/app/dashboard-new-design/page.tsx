"use client";
/**
 * Dashboard Page
 *
 * Story 4.1: Dashboard Layout & Navigation
 * Story 4.2: GlucoseHero Component
 * Story 4.4: Time in Range Bar Component
 * Story 4.5: Real-Time Updates via SSE
 * Story 4.6: Dashboard Accessibility
 * Story 8.3: Role-based routing (caregivers redirect to /dashboard/caregiver)
 * Main dashboard view showing glucose data and metrics.
 *
 * Accessibility features:
 * - Main landmark for skip link navigation
 * - Proper heading hierarchy (h1 for page, h2 for sections)
 * - Logical tab order
 */
import { useEffect, useState, useRef } from"react";
import { useRouter } from"next/navigation";
import { Icon } from"@/base/Icon";
import {
  listIntegrations,
  listNightscoutConnections,
  type IntegrationResponse,
  type NightscoutConnectionResponse,
} from"@/lib/api";
import { AnimatedCard } from"@/components/dashboard-new-design/animated-card";
import { PageTransition } from"@/components/dashboard-new-design/page-transition";
import { Panel } from"@/components/Panel";
import { SecondaryButton } from"@/components/SecondaryButton";
import {
  GlucoseHero,
  parseLoopState,
  type LoopStatusInfo,
  TimeInRangePanel,
  ConnectionStatusBanner,
  GlucoseTrendChart,
  CgmSummaryStats,
  AgpChart,
  InsulinSummaryStats,
  BolusReviewTable,
  DataSourcesFreshnessCard,
  LivePumpStats,
  GlucoseUnitSeedNotice,
  DashboardTimeRangePicker,
  useDashboardTimeRange,
} from"@/components/dashboard-new-design";
import { useGlucoseStreamContext, useUserContext } from"@/providers";
import { useGlucoseUnit } from"@/hooks/use-glucose-unit";
import { useTimeInRangeDetailStats } from"@/hooks/use-time-in-range-stats";
import { useGlucoseStats } from"@/hooks/use-glucose-stats";
import { useGlucoseRange } from"@/hooks/use-glucose-range";
import { usePumpStatus } from"@/hooks/use-pump-status";
import { useForecast } from"@/hooks/use-forecast";
import type { LoopStatusResponse } from"@/lib/api";
/**
 * Map the backend's loop_status payload to the component's
 * LoopStatusInfo shape. `parseLoopState` fails closed on unknown
 * states so a future backend addition (e.g."warming_up") doesn't
 * crash the badge renderer.
 */
function mapLoopStatus(
  raw: LoopStatusResponse | null | undefined
): LoopStatusInfo | null {
  if (!raw) return null;
  const state = parseLoopState(raw.state);
  if (state === null) return null;
  return {
    state,
    source: raw.source,
    issuedAt: raw.issued_at,
    failureReason: raw.failure_reason,
  };
}
function DashboardPageContent() {
  const router = useRouter();
  const dashboardTimeRange = useDashboardTimeRange();
  const { user, isLoading: isUserLoading } = useUserContext();
  const unit = useGlucoseUnit();
  // All hooks must be called before any early return
  const {
    glucose,
    isLive,
    isReconnecting,
    error,
    reconnect,
  } = useGlucoseStreamContext();
  // Chart refresh: throttle to once per 5 minutes when new SSE data arrives
  const [chartRefreshKey, setChartRefreshKey] = useState(0);
  const lastRefreshRef = useRef(0);
  useEffect(() => {
    if (glucose?.reading_timestamp) {
      const now = Date.now();
      if (now - lastRefreshRef.current > 5 * 60 * 1000) {
        lastRefreshRef.current = now;
        setChartRefreshKey((k) => k + 1);
      }
    }
  }, [glucose?.reading_timestamp]);
  // Fetch user's configured glucose range thresholds (always mg/dL; display
  // converts to the active unit).
  const glucoseThresholds = useGlucoseRange();
  // Fetch latest pump status (basal, battery, reservoir) for hero card
  const pumpStatus = usePumpStatus(chartRefreshKey);
  // Story 43.12 PR 4: forecast overlay state for the trend chart.
  // Shares the chart's SSE-driven `chartRefreshKey` so the dotted line
  // refreshes on the same cadence as the underlying readings.
  const { forecast } = useForecast(chartRefreshKey);
  // Per-source freshness for the"Data Sources" card. Fetched once on
  // mount + every 30s after that, with `freshnessNow` advancing every
  // second so relative-time labels can count up without a refetch.
  const [nightscoutConnections, setNightscoutConnections] = useState<
    NightscoutConnectionResponse[]
  >([]);
  const [dexcomIntegration, setDexcomIntegration] =
    useState<IntegrationResponse | null>(null);
  const [tandemIntegration, setTandemIntegration] =
    useState<IntegrationResponse | null>(null);
  const [freshnessNow, setFreshnessNow] = useState<number>(() => Date.now());
  useEffect(() => {
    let cancelled = false;
    const refetch = async () => {
      try {
        const [integrationsResult, nsResult] = await Promise.allSettled([
          listIntegrations(),
          listNightscoutConnections(),
        ]);
        if (cancelled) return;
        if (integrationsResult.status ==="fulfilled") {
          const data = integrationsResult.value;
          setDexcomIntegration(
            data.integrations.find((i) => i.integration_type ==="dexcom") ||
              null
          );
          setTandemIntegration(
            data.integrations.find((i) => i.integration_type ==="tandem") ||
              null
          );
        }
        if (nsResult.status ==="fulfilled") {
          setNightscoutConnections(nsResult.value.connections);
        }
      } catch {
        // Best-effort: leaving stale state during a transient API blip
        // is preferable to clobbering the rendered freshness rows.
      }
    };
    void refetch();
    const refetchInterval = setInterval(() => void refetch(), 30_000);
    const tickInterval = setInterval(() => setFreshnessNow(Date.now()), 1_000);
    return () => {
      cancelled = true;
      clearInterval(refetchInterval);
      clearInterval(tickInterval);
    };
  }, []);
  // Redirect caregivers to the caregiver-specific dashboard (Story 8.3)
  useEffect(() => {
    if (user?.role ==="caregiver") {
      router.replace("/dashboard/caregiver");
    }
  }, [user, router]);
  // Story 30.4 consolidated: single hook for 5-bucket TIR detail stats
  const {
    stats: tirStats,
    isLoading: tirLoading,
    error: tirError,
  } = useTimeInRangeDetailStats("24h", dashboardTimeRange.currentWindow);
  // Story 30.3: Fetch CGM summary stats from API
  const {
    stats: cgmStats,
    isLoading: cgmLoading,
    error: cgmError,
    period: cgmPeriod,
  } = useGlucoseStats("24h", dashboardTimeRange.currentWindow);
  // Prevent flash of diabetic dashboard while caregiver redirect is pending
  if (isUserLoading || user?.role ==="caregiver") {
    return null;
  }
  // Determine data to display
  // Issue 2 & 3 fix: The hook now returns the mapped frontend trend directly
  const glucoseValue = glucose?.value ?? null;
  const glucoseTrend = glucose?.trend ??"Unknown";
  const iob = glucose?.iob?.current ?? null;
  const hasConnectionSources =
    nightscoutConnections.some((connection) => connection.is_active) ||
    Boolean(dexcomIntegration && dexcomIntegration.status !=="disconnected") ||
    Boolean(tandemIntegration && tandemIntegration.status !=="disconnected");
  return (
    <PageTransition>
    <div className="max-w-full min-w-0 space-y-4">
      {/* Connection status banner - Story 4.5 */}
      <ConnectionStatusBanner
        isReconnecting={isReconnecting}
        hasError={!!error}
        errorMessage={error?.message}
        onReconnect={reconnect}
      />
      {/* One-time smart-default glucose-unit notice */}
      <GlucoseUnitSeedNotice />
      {/* Top status panels for live data and configured connections */}
      <AnimatedCard
        className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.65fr)_minmax(20rem,1fr)]"
        delay={0.05}
      >
        <Panel heading="Live CGM" bodyClassName="p-0 sm:p-0" className="min-w-0">
          <GlucoseHero
            value={glucoseValue}
            trend={glucoseTrend}
            iob={iob}
            basalRate={pumpStatus.basal?.rate ?? null}
            batteryPct={pumpStatus.battery?.percentage ?? null}
            reservoirUnits={pumpStatus.reservoir?.units_remaining ?? null}
            timestamp={glucose?.reading_timestamp ?? null}
            // PR 6: closed-loop runtime surfaces. snake_case from the
            // backend, camelCase on the component. All optional.
            cobGrams={pumpStatus.cobGrams}
            loopStatus={mapLoopStatus(pumpStatus.loopStatus)}
            override={
              pumpStatus.override
                ? {
                    name: pumpStatus.override.name,
                    startedAt: pumpStatus.override.started_at,
                    endsAt: pumpStatus.override.ends_at,
                    multiplier: pumpStatus.override.multiplier,
                    targetLowMgdl: pumpStatus.override.target_low_mgdl,
                    targetHighMgdl: pumpStatus.override.target_high_mgdl,
                  }
                : null
            }
            isLoading={!isLive && !glucose}
            embedded
            showPumpStats={false}
            thresholds={glucoseThresholds}
            unit={unit}
          />
        </Panel>
        <Panel heading="Live Pump" className="min-w-0">
          <LivePumpStats
            iob={iob}
            basalRate={pumpStatus.basal?.rate ?? null}
            batteryPct={pumpStatus.battery?.percentage ?? null}
            reservoirUnits={pumpStatus.reservoir?.units_remaining ?? null}
            cobGrams={pumpStatus.cobGrams}
          />
        </Panel>
        <Panel heading="Live Connections" className="min-w-0">
          {hasConnectionSources ? (
            <DataSourcesFreshnessCard
              nightscoutConnections={nightscoutConnections}
              dexcom={dexcomIntegration}
              embedded
              tandem={tandemIntegration}
              now={freshnessNow}
            />
          ) : (
            <div className="space-y-3">
              <p className="font_body_3 text-foreground-primary">
                No connected data sources yet.
              </p>
              <a
                href="/dashboard/settings/integrations"
                className="font_metric_label text-foreground-primary underline underline-offset-4 hover:decoration-2"
              >
                Settings / Integrations
              </a>
            </div>
          )}
        </Panel>
      </AnimatedCard>
      <div
        className="sticky -top-4 z-30 -mx-4 border-y border-border-default bg-surface-elevated px-4 py-3 shadow-sm"
        aria-label="Dashboard time range"
      >
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
          <DashboardTimeRangePicker
            selection={dashboardTimeRange.selection}
            currentWindow={dashboardTimeRange.currentWindow}
            timeZone={dashboardTimeRange.timeZone}
            onChange={dashboardTimeRange.setSelection}
          />
          <SecondaryButton className="h-9" disabled>
            Create report
          </SecondaryButton>
          <SecondaryButton
            ariaLabel="Share dashboard"
            className="h-9 w-9"
            disabled
            size="icon"
          >
            <Icon icon="share" decorative />
          </SecondaryButton>
        </div>
      </div>
      {/* Glucose trend chart */}
      <AnimatedCard delay={0.1}>
        <Panel
          heading="Glucose Trend"
          subheading={
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-foreground-secondary">
              <Icon icon="zoom-in" decorative className="h-3.5 w-3.5" />
              <span>Drag chart to zoom</span>
            </span>
          }
          headerClassName="flex items-center justify-between gap-3"
          subheadingClassName="ml-auto mt-0 font_metric_caption text-foreground-secondary"
          bodyClassName="p-0 sm:p-0"
          className="min-w-0"
        >
          <GlucoseTrendChart
            refreshKey={chartRefreshKey}
            thresholds={glucoseThresholds}
            forecast={forecast}
            unit={unit}
            embedded
          />
        </Panel>
      </AnimatedCard>
      {/* Time in Range and CGM summary */}
      <AnimatedCard
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
        delay={0.15}
      >
        <TimeInRangePanel
          buckets={tirStats?.buckets ?? null}
          readingsCount={tirStats?.readings_count ?? 0}
          previousBuckets={tirStats?.previous_buckets ?? null}
          previousReadingsCount={tirStats?.previous_readings_count ?? null}
          error={tirError}
          isLoading={tirLoading}
          className="h-full"
        />
        <CgmSummaryStats
          stats={cgmStats}
          isLoading={cgmLoading}
          error={cgmError}
          period={cgmPeriod}
          className="h-full"
          unit={unit}
        />
      </AnimatedCard>
      {/* AGP Percentile Band Chart - Story 30.5 */}
      <AnimatedCard delay={0.2}>
        <AgpChart thresholds={glucoseThresholds} unit={unit} />
      </AnimatedCard>
      {/* Insulin Summary & Bolus Review - Story 30.7 */}
      <AnimatedCard delay={0.25}>
        <InsulinSummaryStats />
      </AnimatedCard>
      <AnimatedCard delay={0.3}>
        <BolusReviewTable unit={unit} />
      </AnimatedCard>
    </div>
    </PageTransition>
  );
}

export default function DashboardPage() {
  return <DashboardPageContent />;
}
