import type {
  ActiveAlertsResponse,
  AlertThresholdResponse,
  BolusReviewResponse,
  CgmSourcesResponse,
  CurrentUserResponse,
  ForecastEngine,
  ForecastReadResponse,
  GlucoseHistoryReading,
  GlucoseHistoryResponse,
  GlucosePercentilesResponse,
  GlucoseStats,
  GlookoAvailability,
  GlookoStatus,
  InsightDetail,
  InsightSummary,
  InsightsListResponse,
  IntegrationListResponse,
  IntegrationResponse,
  InsulinSummaryResponse,
  MedtronicAvailabilityResponse,
  MedtronicConnectStatus,
  NightscoutConnectionListResponse,
  NightscoutConnectionResponse,
  NightscoutConnectionTestResult,
  NightscoutManualSyncResponse,
  PumpEventHistoryResponse,
  PumpEventReading,
  PumpProfileSummaryResponse,
  PumpStatusResponse,
  TandemAvailabilityResponse,
  TandemSyncResponse,
  TandemSyncStatusResponse,
  TargetGlucoseRangeResponse,
  TimeInRangeDetailStats,
} from "@/lib/api";

import type {
  MockCgmSource,
  MockDailyBriefResponse,
  MockGlucoseEvent,
  MockPumpSource,
  MockRuntimeState,
} from "./types";
import {
  MOCK_CGM_BACKFILL_MAX_DAYS,
  MOCK_CGM_BACKFILL_MIN_DAYS,
} from "./types";

const MINUTE_MS = 60_000;
const FIVE_MINUTES_MS = 5 * MINUTE_MS;
const DAY_MS = 24 * 60 * MINUTE_MS;
const MOCK_DAILY_BRIEFS_STORAGE_KEY = "glycemicgpt:mock-daily-briefs";
const MOCK_INSIGHT_RESPONSES_STORAGE_KEY = "glycemicgpt:mock-insight-responses";
const MOCK_SEEDED_BRIEF_ID = "00000000-0000-4000-8000-000000000001";

const TARGET_RANGE = {
  urgentLow: 55,
  low: 70,
  high: 180,
  urgentHigh: 250,
};

function clampBackfillDays(days: number): number {
  return Math.max(
    MOCK_CGM_BACKFILL_MIN_DAYS,
    Math.min(MOCK_CGM_BACKFILL_MAX_DAYS, Math.round(days))
  );
}

export interface MockDataSnapshot {
  now: Date;
  glucoseHistory: GlucoseHistoryReading[];
  pumpEvents: PumpEventReading[];
}

function iso(date: Date): string {
  return date.toISOString();
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function createMockId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `00000000-0000-4000-8000-${Date.now().toString().padStart(12, "0").slice(-12)}`;
}

function cgmSourceKey(source: MockCgmSource): string {
  const map: Record<MockCgmSource, string> = {
    dexcom: "dexcom_share",
    "nightscout-loop": "nightscout_loop",
    "nightscout-aaps": "nightscout_aaps",
    "nightscout-trio": "nightscout_trio",
    "nightscout-oref0": "nightscout_oref0",
    xdrip: "xdrip_bridge",
    librelink: "librelinkup",
    share2nightscout: "share2nightscout",
    glooko: "glooko_cgm",
  };
  return map[source];
}

function cgmLabel(source: MockCgmSource): string {
  const map: Record<MockCgmSource, string> = {
    dexcom: "Dexcom Share",
    "nightscout-loop": "Nightscout Loop",
    "nightscout-aaps": "Nightscout AAPS",
    "nightscout-trio": "Nightscout Trio",
    "nightscout-oref0": "Nightscout oref0",
    xdrip: "xDrip",
    librelink: "LibreLinkUp",
    share2nightscout: "share2nightscout",
    glooko: "Glooko CGM",
  };
  return map[source];
}

function pumpSourceKey(source: MockPumpSource): string {
  const map: Record<MockPumpSource, string> = {
    none: "none",
    tandem: "tandem_tconnect",
    "medtronic-connect": "medtronic_connect",
    "medtronic-carelink": "medtronic_carelink",
    "omnipod-glooko": "glooko_omnipod",
    "loop-nightscout": "nightscout_loop",
    "aaps-nightscout": "nightscout_aaps",
    "trio-nightscout": "nightscout_trio",
    "oref0-nightscout": "nightscout_oref0",
    "mobile-plugin": "mobile_plugin",
  };
  return map[source];
}

function forecastEngine(source: MockPumpSource): ForecastEngine | null {
  const map: Partial<Record<MockPumpSource, ForecastEngine>> = {
    "loop-nightscout": "loop",
    "aaps-nightscout": "aaps",
    "trio-nightscout": "trio",
    "oref0-nightscout": "oref0",
    "mobile-plugin": "glycemicgpt",
  };
  return map[source] ?? null;
}

function trendFromDelta(delta: number): GlucoseHistoryReading["trend"] {
  if (delta > 3) return "single_up";
  if (delta > 1) return "forty_five_up";
  if (delta < -3) return "single_down";
  if (delta < -1) return "forty_five_down";
  return "flat";
}

function glucoseAtMinutesAgo(minutesAgo: number, source: MockCgmSource): number {
  const circadian = Math.sin((minutesAgo / 1440) * Math.PI * 2 + 0.5) * 18;
  const mealOne = Math.exp(-(((minutesAgo % 1440) - 520) ** 2) / 17_000) * 58;
  const mealTwo = Math.exp(-(((minutesAgo % 1440) - 1120) ** 2) / 19_000) * 72;
  const overnightDip =
    Math.exp(-(((minutesAgo % 1440) - 210) ** 2) / 12_000) * -22;
  const sensorBias =
    source === "librelink"
      ? -4
      : source === "glooko"
        ? 3
        : source === "xdrip"
          ? 2
          : 0;
  const noise = Math.sin(minutesAgo * 0.19) * 5 + Math.cos(minutesAgo * 0.07) * 3;
  return Math.round(clamp(118 + circadian + mealOne + mealTwo + overnightDip + sensorBias + noise, 48, 310));
}

function glucoseEventTarget(event: MockGlucoseEvent): number | null {
  const targets: Record<MockGlucoseEvent, number | null> = {
    baseline: null,
    low: 62,
    "urgent-low": 48,
    high: 215,
    "urgent-high": 285,
  };
  return targets[event];
}

function mockGlucoseValueAtMinutesAgo(
  minutesAgo: number,
  state: MockRuntimeState
): number {
  const base = glucoseAtMinutesAgo(minutesAgo, state.cgmSource);
  const target = glucoseEventTarget(state.glucoseEvent);
  if (target === null || minutesAgo > 60) {
    return base;
  }

  const blend = 1 - minutesAgo / 60;
  return Math.round(clamp(base * (1 - blend) + target * blend, 40, 330));
}

export function buildMockDataSnapshot(
  state: MockRuntimeState,
  now = new Date()
): MockDataSnapshot {
  const days = clampBackfillDays(state.cgmBackfillDays);
  const count = Math.floor((days * DAY_MS) / FIVE_MINUTES_MS);
  const source = cgmSourceKey(state.cgmSource);
  const glucoseHistory: GlucoseHistoryReading[] = [];

  for (let index = count; index >= 0; index -= 1) {
    const minutesAgo = index * 5;
    const timestamp = new Date(now.getTime() - minutesAgo * MINUTE_MS);
    const value = mockGlucoseValueAtMinutesAgo(minutesAgo, state);
    const comparisonValue =
      minutesAgo === 0
        ? mockGlucoseValueAtMinutesAgo(5, state)
        : mockGlucoseValueAtMinutesAgo(Math.max(0, minutesAgo - 5), state);
    const delta = minutesAgo === 0 ? value - comparisonValue : comparisonValue - value;
    glucoseHistory.push({
      value,
      reading_timestamp: iso(timestamp),
      trend: trendFromDelta(delta),
      trend_rate: round(delta / 5, 2),
      received_at: iso(new Date(timestamp.getTime() + 30_000)),
      source,
    });
  }

  return {
    now,
    glucoseHistory,
    pumpEvents: buildPumpEvents(state, now),
  };
}

function buildPumpEvents(
  state: MockRuntimeState,
  now: Date
): PumpEventReading[] {
  if (state.pumpSource === "none") {
    return [];
  }

  const source = pumpSourceKey(state.pumpSource);
  const days = clampBackfillDays(state.cgmBackfillDays);
  const events: PumpEventReading[] = [];

  for (let day = 0; day < days; day += 1) {
    const dayStart = new Date(now.getTime() - day * DAY_MS);
    const mealOffsets = [8 * 60 + 20, 12 * 60 + 30, 18 * 60 + 45];

    mealOffsets.forEach((offset, mealIndex) => {
      const timestamp = new Date(dayStart);
      timestamp.setHours(0, offset, 0, 0);
      if (timestamp > now) return;
      const units = round(3.2 + mealIndex * 1.4 + (day % 4) * 0.2, 1);
      events.push({
        event_type: mealIndex === 2 ? "correction" : "bolus",
        event_timestamp: iso(timestamp),
        units,
        duration_minutes: null,
        is_automated: mealIndex === 2,
        control_iq_reason:
          state.pumpSource === "tandem" && mealIndex === 2
            ? "auto_correction"
            : null,
        pump_activity_mode: state.pumpSource === "tandem" ? "sleep" : null,
        basal_adjustment_pct: null,
        iob_at_event: round(Math.max(0, 4 - mealIndex * 0.8), 1),
        cob_at_event: mealIndex === 2 ? 12 : 45 + mealIndex * 18,
        bg_at_event: mockGlucoseValueAtMinutesAgo(
          Math.max(
            0,
            Math.round((now.getTime() - timestamp.getTime()) / MINUTE_MS)
          ),
          state
        ),
        received_at: iso(new Date(timestamp.getTime() + 45_000)),
        source,
      });
    });

    for (let hour = 0; hour < 24; hour += 3) {
      const timestamp = new Date(dayStart);
      timestamp.setHours(hour, 0, 0, 0);
      if (timestamp > now) continue;
      const isAutomated = state.pumpSource !== "mobile-plugin";
      events.push({
        event_type: "basal",
        event_timestamp: iso(timestamp),
        units: round(0.65 + Math.sin(hour / 24) * 0.15, 2),
        duration_minutes: 180,
        is_automated: isAutomated,
        control_iq_reason: state.pumpSource === "tandem" ? "scheduled" : null,
        pump_activity_mode: state.pumpSource === "tandem" ? "normal" : null,
        basal_adjustment_pct: isAutomated ? Math.round(85 + Math.sin(hour) * 18) : null,
        iob_at_event: round(Math.max(0, 2.2 + Math.sin(hour) * 0.8), 1),
        cob_at_event: null,
        bg_at_event: mockGlucoseValueAtMinutesAgo(
          Math.max(
            0,
            Math.round((now.getTime() - timestamp.getTime()) / MINUTE_MS)
          ),
          state
        ),
        received_at: iso(new Date(timestamp.getTime() + 45_000)),
        source,
      });
    }
  }

  return events.sort(
    (left, right) =>
      new Date(left.event_timestamp).getTime() -
      new Date(right.event_timestamp).getTime()
  );
}

function filterReadings(
  snapshot: MockDataSnapshot,
  params: URLSearchParams
): GlucoseHistoryReading[] {
  const start = params.get("start");
  const end = params.get("end");
  const minutes = Number(params.get("minutes") ?? "1440");
  const limit = Math.max(1, Math.min(10_000, Number(params.get("limit") ?? "288")));

  let readings = snapshot.glucoseHistory;
  if (start && end) {
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    readings = readings.filter((reading) => {
      const time = new Date(reading.reading_timestamp).getTime();
      return time >= startTime && time <= endTime;
    });
  } else {
    const cutoff = snapshot.now.getTime() - minutes * MINUTE_MS;
    readings = readings.filter(
      (reading) => new Date(reading.reading_timestamp).getTime() >= cutoff
    );
  }

  return readings.slice(-limit);
}

function filterPumpEvents(
  snapshot: MockDataSnapshot,
  params: URLSearchParams
): PumpEventReading[] {
  const minutes = Number(params.get("minutes") ?? "1440");
  const limit = Math.max(1, Math.min(10_000, Number(params.get("limit") ?? "500")));
  const cutoff = snapshot.now.getTime() - minutes * MINUTE_MS;
  return snapshot.pumpEvents
    .filter((event) => new Date(event.event_timestamp).getTime() >= cutoff)
    .slice(-limit);
}

export function buildGlucoseHistoryResponse(
  snapshot: MockDataSnapshot,
  params: URLSearchParams
): GlucoseHistoryResponse {
  const readings = filterReadings(snapshot, params);
  return { readings, count: readings.length };
}

export function buildPumpEventHistoryResponse(
  snapshot: MockDataSnapshot,
  params: URLSearchParams
): PumpEventHistoryResponse {
  const events = filterPumpEvents(snapshot, params);
  return { events, count: events.length };
}

export function buildGlucoseStats(
  snapshot: MockDataSnapshot,
  params: URLSearchParams
): GlucoseStats {
  const readings = filterReadings(snapshot, params);
  const values = readings.map((reading) => reading.value);
  const count = values.length || 1;
  const mean = values.reduce((sum, value) => sum + value, 0) / count;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / count;
  const periodMinutes = params.get("start") && params.get("end")
    ? Math.max(
        0,
        Math.round(
          (new Date(params.get("end") as string).getTime() -
            new Date(params.get("start") as string).getTime()) /
            MINUTE_MS
        )
      )
    : Number(params.get("minutes") ?? "1440");

  return {
    mean_glucose: Math.round(mean),
    std_dev: round(Math.sqrt(variance), 1),
    cv_pct: mean > 0 ? round((Math.sqrt(variance) / mean) * 100, 1) : 0,
    gmi: round(3.31 + 0.02392 * mean, 1),
    cgm_active_pct: readings.length > 0 ? 96 : 0,
    readings_count: readings.length,
    period_minutes: periodMinutes,
  };
}

export function buildTimeInRangeDetail(
  snapshot: MockDataSnapshot,
  params: URLSearchParams
): TimeInRangeDetailStats {
  const readings = filterReadings(snapshot, params);
  const total = readings.length || 1;
  const buckets = [
    {
      label: "urgent_low" as const,
      threshold_low: null,
      threshold_high: TARGET_RANGE.urgentLow,
      values: readings.filter((reading) => reading.value < TARGET_RANGE.urgentLow),
    },
    {
      label: "low" as const,
      threshold_low: TARGET_RANGE.urgentLow,
      threshold_high: TARGET_RANGE.low,
      values: readings.filter(
        (reading) =>
          reading.value >= TARGET_RANGE.urgentLow && reading.value < TARGET_RANGE.low
      ),
    },
    {
      label: "in_range" as const,
      threshold_low: TARGET_RANGE.low,
      threshold_high: TARGET_RANGE.high,
      values: readings.filter(
        (reading) =>
          reading.value >= TARGET_RANGE.low && reading.value <= TARGET_RANGE.high
      ),
    },
    {
      label: "high" as const,
      threshold_low: TARGET_RANGE.high,
      threshold_high: TARGET_RANGE.urgentHigh,
      values: readings.filter(
        (reading) =>
          reading.value > TARGET_RANGE.high && reading.value <= TARGET_RANGE.urgentHigh
      ),
    },
    {
      label: "urgent_high" as const,
      threshold_low: TARGET_RANGE.urgentHigh,
      threshold_high: null,
      values: readings.filter((reading) => reading.value > TARGET_RANGE.urgentHigh),
    },
  ].map(({ values, ...bucket }) => ({
    ...bucket,
    pct: round((values.length / total) * 100, 1),
    readings: values.length,
  }));

  return {
    buckets,
    readings_count: readings.length,
    previous_buckets: null,
    previous_readings_count: null,
    thresholds: {
      urgent_low: TARGET_RANGE.urgentLow,
      low: TARGET_RANGE.low,
      high: TARGET_RANGE.high,
      urgent_high: TARGET_RANGE.urgentHigh,
    },
  };
}

function percentile(values: number[], pct: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((pct / 100) * sorted.length))
  );
  return sorted[index];
}

export function buildGlucosePercentiles(
  snapshot: MockDataSnapshot,
  params: URLSearchParams
): GlucosePercentilesResponse {
  const days = Number(params.get("days") ?? "14");
  const start = snapshot.now.getTime() - days * DAY_MS;
  const readings = snapshot.glucoseHistory.filter(
    (reading) => new Date(reading.reading_timestamp).getTime() >= start
  );
  const buckets = Array.from({ length: 24 }, (_, hour) => {
    const values = readings
      .filter((reading) => new Date(reading.reading_timestamp).getHours() === hour)
      .map((reading) => reading.value);
    return {
      hour,
      p10: percentile(values, 10),
      p25: percentile(values, 25),
      p50: percentile(values, 50),
      p75: percentile(values, 75),
      p90: percentile(values, 90),
      count: values.length,
    };
  });

  return {
    buckets,
    period_days: Math.min(days, MOCK_CGM_BACKFILL_MAX_DAYS),
    readings_count: readings.length,
    is_truncated: days > MOCK_CGM_BACKFILL_MAX_DAYS,
  };
}

export function buildInsulinSummary(
  snapshot: MockDataSnapshot,
  params: URLSearchParams
): InsulinSummaryResponse {
  const boluses = snapshot.pumpEvents.filter(
    (event) => event.event_type === "bolus" || event.event_type === "correction"
  );
  const basalEvents = snapshot.pumpEvents.filter((event) => event.event_type === "basal");
  const bolusUnits = boluses.reduce((sum, event) => sum + (event.units ?? 0), 0);
  const basalUnits = basalEvents.reduce(
    (sum, event) => sum + (event.units ?? 0) * ((event.duration_minutes ?? 0) / 60),
    0
  );
  const total = bolusUnits + basalUnits;
  const periodDays = params.get("start") && params.get("end")
    ? Math.max(
        1,
        Math.round(
          (new Date(params.get("end") as string).getTime() -
            new Date(params.get("start") as string).getTime()) /
            DAY_MS
        )
      )
    : Number(params.get("days") ?? "14");

  return {
    tdd: round(total / Math.max(1, periodDays), 1),
    basal_units: round(basalUnits, 1),
    basal_injection_units: 0,
    basal_injection_count: 0,
    bolus_units: round(bolusUnits, 1),
    correction_units: round(
      boluses
        .filter((event) => event.event_type === "correction")
        .reduce((sum, event) => sum + (event.units ?? 0), 0),
      1
    ),
    basal_pct: total > 0 ? round((basalUnits / total) * 100, 1) : 0,
    bolus_pct: total > 0 ? round((bolusUnits / total) * 100, 1) : 0,
    bolus_count: boluses.length,
    correction_count: boluses.filter((event) => event.event_type === "correction").length,
    period_days: periodDays,
  };
}

function getBriefReadings(
  snapshot: MockDataSnapshot,
  hours: number
): GlucoseHistoryReading[] {
  const start = snapshot.now.getTime() - hours * 60 * MINUTE_MS;
  return snapshot.glucoseHistory.filter(
    (reading) => new Date(reading.reading_timestamp).getTime() >= start
  );
}

function getBriefPumpEvents(
  snapshot: MockDataSnapshot,
  hours: number
): PumpEventReading[] {
  const start = snapshot.now.getTime() - hours * 60 * MINUTE_MS;
  return snapshot.pumpEvents.filter(
    (event) => new Date(event.event_timestamp).getTime() >= start
  );
}

function buildDailyBriefSummary(
  state: MockRuntimeState,
  brief: Omit<MockDailyBriefResponse, "ai_summary">
): string {
  const highLowText =
    brief.low_count > 0 || brief.high_count > 0
      ? `${brief.low_count} low readings and ${brief.high_count} high readings showed up in the window.`
      : "No low or high readings stood out in this window.";
  const pumpText =
    state.pumpSource === "none"
      ? "No pump telemetry was connected, so insulin context is limited."
      : `Pump data from ${pumpSourceKey(state.pumpSource)} contributed ${brief.correction_count} correction events and ${brief.total_insulin ?? 0} units of insulin context.`;

  return [
    `## Mock daily brief`,
    "",
    `Time in range was ${brief.time_in_range_pct}% with an average glucose of ${brief.average_glucose} mg/dL across ${brief.readings_count} CGM readings.`,
    "",
    highLowText,
    "",
    pumpText,
    "",
    `The active mock sources are ${cgmLabel(state.cgmSource)} for CGM and ${state.pumpSource === "none" ? "no pump" : pumpSourceKey(state.pumpSource)} for pump data.`,
    "",
    "Safety Notice: This mock brief is generated for development testing only and is not medical advice.",
  ].join("\n");
}

export function buildMockDailyBrief(
  state: MockRuntimeState,
  snapshot: MockDataSnapshot,
  hours = 24,
  id = createMockId()
): MockDailyBriefResponse {
  const safeHours = Math.max(1, Math.min(72, Math.round(hours)));
  const readings = getBriefReadings(snapshot, safeHours);
  const events = getBriefPumpEvents(snapshot, safeHours);
  const readingCount = readings.length || 1;
  const values = readings.map((reading) => reading.value);
  const averageGlucose = values.length
    ? round(values.reduce((sum, value) => sum + value, 0) / values.length, 1)
    : 0;
  const inRangeCount = readings.filter(
    (reading) => reading.value >= TARGET_RANGE.low && reading.value <= TARGET_RANGE.high
  ).length;
  const bolusEvents = events.filter(
    (event) => event.event_type === "bolus" || event.event_type === "correction"
  );
  const basalUnits = events
    .filter((event) => event.event_type === "basal")
    .reduce(
      (sum, event) => sum + (event.units ?? 0) * ((event.duration_minutes ?? 0) / 60),
      0
    );
  const bolusUnits = bolusEvents.reduce((sum, event) => sum + (event.units ?? 0), 0);
  const periodEnd = snapshot.now;
  const periodStart = new Date(periodEnd.getTime() - safeHours * 60 * MINUTE_MS);

  const briefWithoutSummary = {
    id,
    period_start: iso(periodStart),
    period_end: iso(periodEnd),
    time_in_range_pct: round((inRangeCount / readingCount) * 100, 1),
    average_glucose: averageGlucose,
    low_count: readings.filter((reading) => reading.value < TARGET_RANGE.low).length,
    high_count: readings.filter((reading) => reading.value > TARGET_RANGE.high).length,
    readings_count: readings.length,
    correction_count: events.filter((event) => event.event_type === "correction").length,
    total_insulin:
      state.pumpSource === "none" ? null : round(basalUnits + bolusUnits, 1),
    ai_model: "mock-daily-brief-v1",
    ai_provider: "msw",
    input_tokens: Math.max(900, readings.length * 8),
    output_tokens: 420,
    created_at: iso(snapshot.now),
  };

  return {
    ...briefWithoutSummary,
    ai_summary: buildDailyBriefSummary(state, briefWithoutSummary),
  };
}

function getStoredMockDailyBriefs(): MockDailyBriefResponse[] {
  if (!hasWindow()) return [];
  return safeJsonParse<MockDailyBriefResponse[]>(
    window.localStorage.getItem(MOCK_DAILY_BRIEFS_STORAGE_KEY),
    []
  );
}

function setStoredMockDailyBriefs(briefs: MockDailyBriefResponse[]): void {
  if (!hasWindow()) return;
  window.localStorage.setItem(
    MOCK_DAILY_BRIEFS_STORAGE_KEY,
    JSON.stringify(briefs.slice(0, 50))
  );
}

type MockInsightResponse = {
  response: "acknowledged" | "dismissed";
  reason: string | null;
  responded_at: string;
};

function getStoredInsightResponses(): Record<string, MockInsightResponse> {
  if (!hasWindow()) return {};
  return safeJsonParse<Record<string, MockInsightResponse>>(
    window.localStorage.getItem(MOCK_INSIGHT_RESPONSES_STORAGE_KEY),
    {}
  );
}

function setStoredInsightResponses(
  responses: Record<string, MockInsightResponse>
): void {
  if (!hasWindow()) return;
  window.localStorage.setItem(
    MOCK_INSIGHT_RESPONSES_STORAGE_KEY,
    JSON.stringify(responses)
  );
}

export function generateAndStoreMockDailyBrief(
  state: MockRuntimeState,
  snapshot: MockDataSnapshot,
  hours = 24
): MockDailyBriefResponse {
  const brief = buildMockDailyBrief(state, snapshot, hours);
  const stored = getStoredMockDailyBriefs().filter((item) => item.id !== brief.id);
  setStoredMockDailyBriefs([brief, ...stored]);
  return brief;
}

function getMockDailyBriefs(
  state: MockRuntimeState,
  snapshot: MockDataSnapshot
): MockDailyBriefResponse[] {
  const stored = getStoredMockDailyBriefs();
  if (stored.length > 0) {
    return stored;
  }

  return [buildMockDailyBrief(state, snapshot, 24, MOCK_SEEDED_BRIEF_ID)];
}

function briefTitle(brief: MockDailyBriefResponse): string {
  return `Daily brief for ${new Date(brief.period_end).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}`;
}

function briefStatus(brief: MockDailyBriefResponse): InsightSummary["status"] {
  return getStoredInsightResponses()[brief.id]?.response ?? "pending";
}

function briefToInsight(brief: MockDailyBriefResponse): InsightSummary {
  return {
    id: brief.id,
    analysis_type: "daily_brief",
    title: briefTitle(brief),
    content: brief.ai_summary,
    created_at: brief.created_at,
    status: briefStatus(brief),
  };
}

export function buildMockInsights(
  state: MockRuntimeState,
  snapshot: MockDataSnapshot,
  params: URLSearchParams
): InsightsListResponse {
  const limit = Math.max(1, Math.min(100, Number(params.get("limit") ?? "10")));
  const insights = getMockDailyBriefs(state, snapshot)
    .map(briefToInsight)
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    );

  return {
    insights: insights.slice(0, limit),
    total: insights.length,
  };
}

export function buildMockUnreadInsightCount(
  state: MockRuntimeState,
  snapshot: MockDataSnapshot
): { unread_count: number } {
  return {
    unread_count: getMockDailyBriefs(state, snapshot).filter(
      (brief) => briefStatus(brief) === "pending"
    ).length,
  };
}

export function findMockDailyBrief(
  state: MockRuntimeState,
  snapshot: MockDataSnapshot,
  briefId: string
): MockDailyBriefResponse | null {
  return (
    getMockDailyBriefs(state, snapshot).find((brief) => brief.id === briefId) ??
    null
  );
}

export function buildMockInsightDetail(
  state: MockRuntimeState,
  snapshot: MockDataSnapshot,
  briefId: string
): InsightDetail | null {
  const brief = findMockDailyBrief(state, snapshot, briefId);
  if (!brief) return null;

  const response = getStoredInsightResponses()[brief.id] ?? null;

  return {
    id: brief.id,
    analysis_type: "daily_brief",
    title: briefTitle(brief),
    content: brief.ai_summary,
    created_at: brief.created_at,
    status: response?.response ?? "pending",
    period_start: brief.period_start,
    period_end: brief.period_end,
    data_context: {
      time_in_range_pct: brief.time_in_range_pct,
      average_glucose: brief.average_glucose,
      low_count: brief.low_count,
      high_count: brief.high_count,
      readings_count: brief.readings_count,
      correction_count: brief.correction_count,
      total_insulin: brief.total_insulin,
      cgm_source: cgmLabel(state.cgmSource),
      pump_source: state.pumpSource === "none" ? "No pump" : pumpSourceKey(state.pumpSource),
    },
    model_info: {
      model: brief.ai_model,
      provider: brief.ai_provider,
      input_tokens: brief.input_tokens,
      output_tokens: brief.output_tokens,
    },
    safety: {
      status: "safe",
      has_dangerous_content: false,
      flagged_items: [],
      validated_at: brief.created_at,
    },
    user_response: response
      ? {
          response: response.response,
          reason: response.reason,
          responded_at: response.responded_at,
        }
      : null,
  };
}

export function recordMockInsightResponse(
  analysisId: string,
  response: "acknowledged" | "dismissed",
  reason: string | null,
  now = new Date()
) {
  const responses = getStoredInsightResponses();
  responses[analysisId] = {
    response,
    reason,
    responded_at: iso(now),
  };
  setStoredInsightResponses(responses);

  return {
    id: createMockId(),
    analysis_type: "daily_brief",
    analysis_id: analysisId,
    response,
    reason,
    created_at: iso(now),
  };
}

export function buildBolusReview(
  snapshot: MockDataSnapshot,
  params: URLSearchParams
): BolusReviewResponse {
  const limit = Number(params.get("limit") ?? "100");
  const boluses = snapshot.pumpEvents
    .filter((event) => event.event_type === "bolus" || event.event_type === "correction")
    .slice(-limit)
    .reverse()
    .map((event) => ({
      event_timestamp: event.event_timestamp,
      event_type: event.event_type,
      units: event.units ?? 0,
      is_automated: event.is_automated,
      control_iq_reason: event.control_iq_reason,
      pump_activity_mode: event.pump_activity_mode,
      iob_at_event: event.iob_at_event,
      bg_at_event: event.bg_at_event,
    }));

  return {
    boluses,
    total_count: boluses.length,
    period_days: Number(params.get("days") ?? "7"),
  };
}

export function buildPumpStatus(
  state: MockRuntimeState,
  snapshot: MockDataSnapshot
): PumpStatusResponse {
  if (state.pumpSource === "none") {
    return {
      basal: null,
      battery: null,
      reservoir: null,
      loop_status: null,
      override: null,
      cob_grams: null,
    };
  }

  const timestamp = iso(snapshot.now);
  const engine = forecastEngine(state.pumpSource);
  return {
    basal: {
      rate: state.pumpSource === "tandem" ? 0.92 : 0.74,
      is_automated: state.pumpSource !== "mobile-plugin",
      timestamp,
    },
    battery: {
      percentage: state.pumpSource === "omnipod-glooko" ? 78 : 64,
      is_charging: false,
      timestamp,
    },
    reservoir: {
      units_remaining: state.pumpSource === "omnipod-glooko" ? 92 : 128,
      timestamp,
    },
    loop_status: engine
      ? {
          state: "looping",
          source: engine === "glycemicgpt" ? "loop" : engine,
          issued_at: timestamp,
          failure_reason: null,
        }
      : null,
    override:
      state.pumpSource === "aaps-nightscout"
        ? {
            name: "Exercise",
            started_at: iso(new Date(snapshot.now.getTime() - 42 * MINUTE_MS)),
            ends_at: iso(new Date(snapshot.now.getTime() + 78 * MINUTE_MS)),
            multiplier: 0.65,
            target_low_mgdl: 130,
            target_high_mgdl: 150,
          }
        : null,
    cob_grams: 36,
  };
}

export function buildForecast(
  state: MockRuntimeState,
  snapshot: MockDataSnapshot
): ForecastReadResponse {
  const engine = forecastEngine(state.pumpSource);
  if (!engine) {
    return {
      source_preference: "auto",
      effective_source: null,
      available_sources: [],
      forecast: null,
      forecast_unavailable_reason:
        state.pumpSource === "none" ? "no_sources" : "needs_pick",
    };
  }

  const current = snapshot.glucoseHistory.at(-1)?.value ?? 120;
  const main = Array.from({ length: 13 }, (_, index) =>
    Math.round(current + Math.sin(index / 2) * 11 - index * 1.2)
  );

  return {
    source_preference: "auto",
    effective_source: engine,
    available_sources: [engine],
    forecast: {
      source_engine: engine,
      source_uploader: cgmLabel(state.cgmSource),
      issued_at: iso(snapshot.now),
      start_at: iso(snapshot.now),
      step_minutes: 5,
      horizon_minutes: 60,
      curves_mgdl: {
        main,
        IOB: main.map((value, index) => value - index * 2),
        COB: main.map((value, index) => value + Math.max(0, 18 - index * 2)),
      },
      default_curve_name: "main",
    },
    forecast_unavailable_reason: null,
  };
}

export function buildIntegrations(
  state: MockRuntimeState,
  now: Date
): IntegrationListResponse {
  const dexcomConnected = state.cgmSource === "dexcom";
  const tandemConnected = state.pumpSource === "tandem";
  const createdAt = iso(new Date(now.getTime() - 21 * DAY_MS));
  const updatedAt = iso(now);
  const integration = (
    integration_type: IntegrationResponse["integration_type"],
    connected: boolean,
    region: string | null
  ): IntegrationResponse => ({
    integration_type,
    status: connected ? "connected" : "disconnected",
    last_sync_at: connected ? updatedAt : null,
    last_error: null,
    created_at: createdAt,
    updated_at: updatedAt,
    region,
  });

  return {
    integrations: [
      integration("dexcom", dexcomConnected, "US"),
      integration("tandem", tandemConnected, "US"),
    ],
  };
}

export function buildNightscoutConnections(
  state: MockRuntimeState,
  now: Date
): NightscoutConnectionListResponse {
  const usesNightscout =
    state.cgmSource.startsWith("nightscout") ||
    state.pumpSource.endsWith("nightscout");
  if (!usesNightscout) {
    return { connections: [] };
  }

  const uploader =
    state.cgmSource === "nightscout-aaps" || state.pumpSource === "aaps-nightscout"
      ? "aaps"
      : state.cgmSource === "nightscout-trio" || state.pumpSource === "trio-nightscout"
        ? "trio"
        : state.cgmSource === "nightscout-oref0" ||
            state.pumpSource === "oref0-nightscout"
          ? "oref0"
          : "loop";

  const connection: NightscoutConnectionResponse = {
    id: "mock-nightscout-primary",
    name: `${uploader.toUpperCase()} Nightscout`,
    base_url: `https://${uploader}.mock-nightscout.local`,
    auth_type: "token",
    api_version: "v3",
    is_active: true,
    has_credential: true,
    sync_interval_minutes: 5,
    initial_sync_window_days: state.cgmBackfillDays,
    last_sync_status: "ok",
    last_synced_at: iso(now),
    last_sync_error: null,
    detected_uploaders_json: {
      uploaders: [uploader],
      cgm: cgmLabel(state.cgmSource),
      pump: pumpSourceKey(state.pumpSource),
    },
    last_evaluated_at: iso(now),
    created_at: iso(new Date(now.getTime() - 30 * DAY_MS)),
    updated_at: iso(now),
  };

  return { connections: [connection] };
}

export function buildCgmSources(state: MockRuntimeState): CgmSourcesResponse {
  const primary = cgmSourceKey(state.cgmSource);
  const sources: CgmSourcesResponse["sources"] = [
    {
      source: primary,
      label: cgmLabel(state.cgmSource),
      role: "primary" as const,
      kind: state.cgmSource.startsWith("nightscout") ? "nightscout" : "dexcom",
    },
  ];

  if (state.cgmSource !== "dexcom") {
    sources.push({
      source: "dexcom_share",
      label: "Dexcom Share",
      role: "secondary",
      kind: "dexcom",
    });
  }

  return {
    sources,
    primary_source: primary,
    multiple_sources: sources.length > 1,
  };
}

export function buildTandemSyncStatus(
  state: MockRuntimeState,
  now: Date
): TandemSyncStatusResponse {
  const connected = state.pumpSource === "tandem";
  return {
    integration_status: connected ? "connected" : "disconnected",
    last_sync_at: connected ? iso(now) : null,
    last_error: null,
    events_available: connected ? 480 : 0,
    enabled: connected,
    sync_interval_minutes: 15,
    events_pulled_total: connected ? 12_840 : 0,
    needs_country_reselect: false,
  };
}

export function buildMedtronicConnectStatus(
  state: MockRuntimeState,
  now: Date
): MedtronicConnectStatus {
  const connected = state.pumpSource === "medtronic-connect";
  return {
    connected,
    status: connected ? "connected" : "not_configured",
    enabled: connected,
    region: connected ? "US" : null,
    role: connected ? "carepartner" : null,
    sync_interval_minutes: connected ? 15 : null,
    last_sync_at: connected ? iso(now) : null,
    last_error: null,
    readings_synced_total: connected ? 8_640 : 0,
  };
}

export function buildGlookoStatus(
  state: MockRuntimeState,
  now: Date
): GlookoStatus {
  const connected =
    state.pumpSource === "omnipod-glooko" || state.cgmSource === "glooko";
  return {
    connected,
    status: connected ? "connected" : "not_configured",
    enabled: connected,
    cgm_sync_enabled: state.cgmSource === "glooko",
    region: connected ? "us" : null,
    sync_interval_minutes: connected ? 30 : 15,
    last_sync_at: connected ? iso(now) : null,
    last_error: null,
    readings_synced_total: connected ? 8_640 : 0,
    consent_acknowledged_at: connected ? iso(new Date(now.getTime() - DAY_MS)) : null,
  };
}

export function buildUser(now: Date): CurrentUserResponse {
  return {
    id: "mock-user",
    email: "mock.patient@glycemicgpt.local",
    display_name: "Mock Patient",
    role: "diabetic",
    is_active: true,
    email_verified: true,
    disclaimer_acknowledged: true,
    disclaimer_version: "dev-mock",
    glucose_unit: "mgdl",
    glucose_unit_source: "user",
    meal_intelligence_enabled: true,
    created_at: iso(new Date(now.getTime() - 90 * DAY_MS)),
  };
}

export function buildActiveAlerts(snapshot: MockDataSnapshot): ActiveAlertsResponse {
  const latest = snapshot.glucoseHistory.at(-1);
  if (!latest || (latest.value >= TARGET_RANGE.low && latest.value <= TARGET_RANGE.high)) {
    return { alerts: [], count: 0 };
  }

  const isLow = latest.value < TARGET_RANGE.low;
  const isUrgent = isLow
    ? latest.value < TARGET_RANGE.urgentLow
    : latest.value > TARGET_RANGE.urgentHigh;
  const alert = {
    id: isLow ? "mock-alert-low" : "mock-alert-high",
    alert_type: isLow ? "low_glucose" : "high_glucose",
    severity: isUrgent ? "urgent" : "warning",
    current_value: latest.value,
    predicted_value: isLow ? latest.value - 8 : latest.value + 18,
    prediction_minutes: 30,
    iob_value: 1.8,
    message: isLow
      ? "Mock trend predicts low glucose."
      : "Mock trend predicts elevated glucose.",
    trend_rate: latest.trend_rate,
    source: latest.source,
    acknowledged: false,
    acknowledged_at: null,
    created_at: iso(snapshot.now),
    expires_at: iso(new Date(snapshot.now.getTime() + 45 * MINUTE_MS)),
  };

  return { alerts: [alert], count: 1 };
}

export function buildTargetRange(now: Date): TargetGlucoseRangeResponse {
  return {
    id: "mock-target-range",
    urgent_low: TARGET_RANGE.urgentLow,
    low_target: TARGET_RANGE.low,
    high_target: TARGET_RANGE.high,
    urgent_high: TARGET_RANGE.urgentHigh,
    updated_at: iso(now),
  };
}

export function buildAlertThresholds(now: Date): AlertThresholdResponse {
  return {
    id: "mock-alert-thresholds",
    low_warning: 70,
    urgent_low: 55,
    high_warning: 180,
    urgent_high: 250,
    iob_warning: 6,
    updated_at: iso(now),
  };
}

export function buildPumpProfile(now: Date): PumpProfileSummaryResponse {
  return {
    profile_name: "Mock profile",
    is_active: true,
    dia_minutes: 300,
    max_bolus_units: 12,
    segments: [
      {
        time: "00:00",
        start_minutes: 0,
        basal_rate: 0.72,
        correction_factor: 44,
        carb_ratio: 11,
        target_bg: 110,
      },
      {
        time: "06:00",
        start_minutes: 360,
        basal_rate: 0.88,
        correction_factor: 38,
        carb_ratio: 9,
        target_bg: 105,
      },
      {
        time: "22:00",
        start_minutes: 1320,
        basal_rate: 0.76,
        correction_factor: 46,
        carb_ratio: 12,
        target_bg: 115,
      },
    ],
    synced_at: iso(now),
  };
}

export function buildTandemAvailability(now: Date): TandemAvailabilityResponse {
  return {
    earliest: iso(new Date(now.getTime() - 30 * DAY_MS)),
    latest: iso(now),
    pump_count: 1,
  };
}

export function buildMedtronicAvailability(now: Date): MedtronicAvailabilityResponse {
  return {
    start: iso(new Date(now.getTime() - 30 * DAY_MS)),
    end: iso(now),
  };
}

export function buildGlookoAvailability(
  state: MockRuntimeState,
  now: Date
): GlookoAvailability {
  const connected =
    state.pumpSource === "omnipod-glooko" || state.cgmSource === "glooko";
  return {
    connected,
    cgm_available: state.cgmSource === "glooko",
    earliest: connected ? iso(new Date(now.getTime() - 30 * DAY_MS)) : null,
    latest: connected ? iso(now) : null,
  };
}

export function buildSyncResponse(
  snapshot: MockDataSnapshot
): TandemSyncResponse {
  return {
    message: "Mock sync complete",
    events_fetched: snapshot.pumpEvents.length,
    events_stored: snapshot.pumpEvents.length,
    profiles_stored: 1,
  };
}

export function buildNightscoutSyncResponse(
  state: MockRuntimeState
): NightscoutManualSyncResponse {
  return {
    connection_id: "mock-nightscout-primary",
    status: "ok",
    entries_inserted: clampBackfillDays(state.cgmBackfillDays) * 288,
    entries_skipped: 0,
    entries_failed: 0,
    treatments_inserted_pump: state.pumpSource.endsWith("nightscout") ? 120 : 0,
    treatments_inserted_glucose: 0,
    treatments_failed: 0,
    devicestatuses_inserted: state.pumpSource.endsWith("nightscout") ? 96 : 0,
    devicestatuses_failed: 0,
    profile_synced: state.pumpSource.endsWith("nightscout"),
    duration_ms: 340,
    error: null,
  };
}

export function buildNightscoutTestResult(): NightscoutConnectionTestResult {
  return {
    ok: true,
    server_version: "15.0.0-mock",
    api_version_detected: "v3",
    auth_validated: true,
    error: null,
  };
}
