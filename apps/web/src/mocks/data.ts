import type {
  ActiveAlertsResponse,
  AlertThresholdResponse,
  BolusReviewItem,
  BolusReviewResponse,
  CgmSourcesResponse,
  CurrentUserResponse,
  ForecastEngine,
  ForecastReadResponse,
  ForecastSourcePreference,
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
  KnowledgeDocument,
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

import { formatGlucose, unitLabel } from "@/lib/glucose-units";
import type { GlucoseUnit } from "@/lib/glucose-units";

import { bolusReviewUnknownEventTypeFixture } from "./fixtures";
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
  MOCK_KNOWLEDGE_DOCUMENT_MAX_COUNT,
  MOCK_KNOWLEDGE_DOCUMENT_MIN_COUNT,
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
const GLUCOSE_EXCURSION_CYCLE_DAYS = 7;
const SCHEDULED_BASAL_RATES = [
  0.68, 0.76, 0.96, 0.84, 0.88, 0.62, 0.94, 0.74,
] as const;
const KNOWLEDGE_DOCUMENT_TEMPLATES = [
  {
    name: "ADA Standards of Care in Diabetes",
    sourceType: "guideline",
    tier: "AUTHORITATIVE",
  },
  {
    name: "International Consensus on Time in Range",
    sourceType: "consensus",
    tier: "AUTHORITATIVE",
  },
  {
    name: "Exercise and Glucose Management Review",
    sourceType: "research",
    tier: "RESEARCHED",
  },
  {
    name: "Nutrition Patterns and Glycemic Outcomes",
    sourceType: "research",
    tier: "RESEARCHED",
  },
  {
    name: "Personal Diabetes Management Notes",
    sourceType: "upload",
    tier: "USER_PROVIDED",
  },
  {
    name: "Meal Response Journal",
    sourceType: "upload",
    tier: "USER_PROVIDED",
  },
  {
    name: "Insulin Pump Safety Reference",
    sourceType: "reference",
    tier: "EXTRACTED",
  },
  {
    name: "Continuous Glucose Monitoring Overview",
    sourceType: "reference",
    tier: "EXTRACTED",
  },
] as const;

function clampBackfillDays(days: number): number {
  return Math.max(
    MOCK_CGM_BACKFILL_MIN_DAYS,
    Math.min(MOCK_CGM_BACKFILL_MAX_DAYS, Math.round(days)),
  );
}

function clampKnowledgeDocumentCount(count: number): number {
  if (!Number.isFinite(count)) {
    return MOCK_KNOWLEDGE_DOCUMENT_MIN_COUNT;
  }

  return Math.max(
    MOCK_KNOWLEDGE_DOCUMENT_MIN_COUNT,
    Math.min(MOCK_KNOWLEDGE_DOCUMENT_MAX_COUNT, Math.round(count)),
  );
}

export function buildMockKnowledgeDocuments(
  state: MockRuntimeState,
  now = new Date(),
): KnowledgeDocument[] {
  const count = clampKnowledgeDocumentCount(state.knowledgeDocumentCount);
  return Array.from({ length: count }, (_, index) => {
    const template =
      KNOWLEDGE_DOCUMENT_TEMPLATES[index % KNOWLEDGE_DOCUMENT_TEMPLATES.length];
    const edition = Math.floor(index / KNOWLEDGE_DOCUMENT_TEMPLATES.length) + 1;
    const chunkCount = 2 + (index % 5);
    const updatedAt = new Date(now.getTime() - index * DAY_MS);
    const createdAt = new Date(updatedAt.getTime() - 30 * DAY_MS);
    const slug = `${template.sourceType}-${index + 1}`;

    return {
      source_name: `${template.name} ${edition}`,
      source_url: `https://example.test/knowledge/${slug}`,
      source_type: template.sourceType,
      trust_tier: template.tier,
      chunk_count: chunkCount,
      total_content_length: chunkCount * (620 + index * 7),
      first_created: iso(createdAt),
      last_updated: iso(updatedAt),
      injection_risk_count: 0,
      update_source: "mock",
      change_summary: "Deterministic mock knowledge base document.",
    };
  });
}

export interface MockDataSnapshot {
  now: Date;
  glucoseHistory: GlucoseHistoryReading[];
  pumpEvents: PumpEventReading[];
  /** IoB in units, driven by `state.glucoseEvent` -- see `mockIobValueForEvent`. */
  iobValue: number;
  /** The mocked user's display unit, so alert message text can render in it
   * like `check_threshold_crossings` does -- numeric fields stay canonical mg/dL. */
  glucoseUnit: GlucoseUnit;
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
    mdi: "manual_insulin_pen",
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

function hasPumpTelemetry(source: MockPumpSource): boolean {
  return source !== "none" && source !== "mdi";
}

function primaryCgmSource(state: MockRuntimeState): MockCgmSource | null {
  return state.cgmSources[0] ?? null;
}

function primaryPumpSource(state: MockRuntimeState): MockPumpSource {
  return state.pumpSources[0] ?? "none";
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

function availableForecastEngines(state: MockRuntimeState): ForecastEngine[] {
  if (!primaryCgmSource(state)) {
    return [];
  }

  return state.pumpSources
    .reduce<ForecastEngine[]>((engines, source) => {
      const engine = forecastEngine(source);
      if (engine && !engines.includes(engine)) {
        engines.push(engine);
      }
      return engines;
    }, [])
    .sort();
}

function effectiveForecastEngine(
  preference: ForecastSourcePreference,
  available: ForecastEngine[],
): ForecastEngine | null {
  if (preference === "none") {
    return null;
  }
  if (preference === "auto") {
    return available.length === 1 ? available[0] : null;
  }
  return available.includes(preference as ForecastEngine)
    ? (preference as ForecastEngine)
    : null;
}

function trendFromDelta(delta: number): GlucoseHistoryReading["trend"] {
  if (delta > 3) return "single_up";
  if (delta > 1) return "forty_five_up";
  if (delta < -3) return "single_down";
  if (delta < -1) return "forty_five_down";
  return "flat";
}

function seededUnit(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43_758.5453;
  return value - Math.floor(value);
}

function seededInteger(seed: number, min: number, max: number): number {
  return min + Math.floor(seededUnit(seed) * (max - min + 1));
}

function distributedDailyMinutes(
  count: number,
  startMinute: number,
  endMinute: number,
  seed: number,
): number[] {
  const span = endMinute - startMinute;
  const slotSize = span / count;

  return Array.from({ length: count }, (_, index) => {
    const slotCenter = startMinute + slotSize * (index + 0.5);
    const jitter = (seededUnit(seed + index * 37) - 0.5) * slotSize * 0.8;
    return Math.round(clamp(slotCenter + jitter, startMinute, endMinute));
  });
}

function smoothNoise(position: number, seedOffset: number): number {
  const left = Math.floor(position);
  const progress = position - left;
  const eased = progress * progress * (3 - 2 * progress);
  const leftValue = seededUnit(left + seedOffset) * 2 - 1;
  const rightValue = seededUnit(left + 1 + seedOffset) * 2 - 1;
  return leftValue + (rightValue - leftValue) * eased;
}

function gaussianResponse(
  minuteOfDay: number,
  center: number,
  width: number,
  amplitude: number,
): number {
  return Math.exp(-0.5 * ((minuteOfDay - center) / width) ** 2) * amplitude;
}

interface DailyGlucoseExcursion {
  kind: "urgent-high" | "urgent-low";
  centerMinute: number;
  widthMinutes: number;
  amplitude: number;
}

function cycleDay(dayIndex: number): number {
  return (
    ((dayIndex % GLUCOSE_EXCURSION_CYCLE_DAYS) + GLUCOSE_EXCURSION_CYCLE_DAYS) %
    GLUCOSE_EXCURSION_CYCLE_DAYS
  );
}

function glucoseExcursionForDay(
  dayIndex: number,
): DailyGlucoseExcursion | null {
  if (cycleDay(dayIndex) === 1) {
    return {
      kind: "urgent-high",
      centerMinute: 20 * 60 + seededUnit(dayIndex * 79 + 1_009) * 90 - 45,
      widthMinutes: 32 + seededUnit(dayIndex * 83 + 1_013) * 10,
      amplitude: 135 + seededUnit(dayIndex * 89 + 1_019) * 30,
    };
  }

  if (cycleDay(dayIndex) === 4) {
    return {
      kind: "urgent-low",
      centerMinute: 3 * 60 + seededUnit(dayIndex * 97 + 1_021) * 90 - 45,
      widthMinutes: 26 + seededUnit(dayIndex * 101 + 1_031) * 10,
      amplitude: -(78 + seededUnit(dayIndex * 103 + 1_033) * 18),
    };
  }

  return null;
}

function scheduledBasalRateAtHour(hour: number): number {
  const scheduleIndex = Math.floor(clamp(hour, 0, 23) / 3);
  return SCHEDULED_BASAL_RATES[scheduleIndex];
}

function basalDeliveryAtTime(
  daySeed: number,
  hour: number,
  glucose: number,
  isAutomated: boolean,
  activityMode: "exercise" | "none" | "sleep" | null,
): { adjustmentPercentage: number | null; rate: number } {
  const scheduledRate = scheduledBasalRateAtHour(hour);
  if (!isAutomated) {
    return { adjustmentPercentage: null, rate: scheduledRate };
  }

  const glucoseAdjustment = clamp((glucose - 110) / 140, -0.42, 0.5);
  const dailyAdjustment = smoothNoise(daySeed * 8 + hour / 3, 1_037) * 0.18;
  const activityAdjustment =
    activityMode === "exercise" ? -0.18 : activityMode === "sleep" ? -0.04 : 0;
  const multiplier = clamp(
    1 + glucoseAdjustment + dailyAdjustment + activityAdjustment,
    0.38,
    1.55,
  );

  return {
    adjustmentPercentage: Math.round(multiplier * 100),
    rate: round(scheduledRate * multiplier, 2),
  };
}

function glucoseAtTime(readingTime: Date, source: MockCgmSource): number {
  const minuteOfDay =
    readingTime.getHours() * 60 +
    readingTime.getMinutes() +
    readingTime.getSeconds() / 60;
  const dayIndex = Math.floor(
    new Date(
      readingTime.getFullYear(),
      readingTime.getMonth(),
      readingTime.getDate(),
    ).getTime() / DAY_MS,
  );
  const absoluteMinutes = readingTime.getTime() / MINUTE_MS;
  const sourceSeed = {
    dexcom: 101,
    "nightscout-loop": 211,
    "nightscout-aaps": 307,
    "nightscout-trio": 401,
    "nightscout-oref0": 503,
    xdrip: 601,
    librelink: 701,
    share2nightscout: 809,
    glooko: 907,
  } satisfies Record<MockCgmSource, number>;
  const dailyBaseline = 105 + smoothNoise(dayIndex / 3, 17) * 12;
  const circadianAmplitude = 8 + seededUnit(dayIndex * 3 + 29) * 10;
  const circadianPhase = seededUnit(dayIndex * 5 + 31) * 75 - 37.5;
  const circadian =
    Math.sin(((minuteOfDay - 360 + circadianPhase) / 1440) * Math.PI * 2) *
    circadianAmplitude;

  const breakfastCenter = 8 * 60 + seededUnit(dayIndex * 11 + 37) * 90 - 45;
  const breakfast = gaussianResponse(
    minuteOfDay,
    breakfastCenter,
    55 + seededUnit(dayIndex * 13 + 41) * 35,
    20 + seededUnit(dayIndex * 17 + 43) * 30,
  );
  const lunchCenter = 13 * 60 + seededUnit(dayIndex * 19 + 47) * 100 - 50;
  const lunchScale = seededUnit(dayIndex * 23 + 53) < 0.12 ? 0.35 : 1;
  const lunch = gaussianResponse(
    minuteOfDay,
    lunchCenter,
    60 + seededUnit(dayIndex * 29 + 59) * 40,
    (18 + seededUnit(dayIndex * 31 + 61) * 32) * lunchScale,
  );
  const dinnerCenter = 19 * 60 + seededUnit(dayIndex * 37 + 67) * 120 - 60;
  const dinner = gaussianResponse(
    minuteOfDay,
    dinnerCenter,
    75 + seededUnit(dayIndex * 41 + 71) * 45,
    25 + seededUnit(dayIndex * 43 + 73) * 40,
  );
  const dawnRise = gaussianResponse(
    minuteOfDay,
    6 * 60 + seededUnit(dayIndex * 47 + 79) * 60 - 30,
    85,
    6 + seededUnit(dayIndex * 53 + 83) * 12,
  );
  const activityDip = gaussianResponse(
    minuteOfDay,
    16 * 60 + seededUnit(dayIndex * 59 + 89) * 180 - 90,
    50 + seededUnit(dayIndex * 61 + 97) * 45,
    -(10 + seededUnit(dayIndex * 67 + 101) * 22),
  );
  const overnightDip = gaussianResponse(
    minuteOfDay,
    3 * 60 + seededUnit(dayIndex * 71 + 103) * 60 - 30,
    90,
    -(12 + seededUnit(dayIndex * 73 + 107) * 18),
  );
  const excursion = glucoseExcursionForDay(dayIndex);
  const occasionalExcursion = excursion
    ? gaussianResponse(
        minuteOfDay,
        excursion.centerMinute,
        excursion.widthMinutes,
        excursion.amplitude,
      )
    : 0;
  const sensorBias =
    source === "librelink"
      ? -4
      : source === "glooko"
        ? 3
        : source === "xdrip"
          ? 2
          : 0;
  const sourceOffset = sourceSeed[source];
  const correlatedNoise =
    smoothNoise(absoluteMinutes / 25, sourceOffset + 109) * 6 +
    smoothNoise(absoluteMinutes / 90, sourceOffset + 211) * 5;
  const dailySensorDrift = smoothNoise(dayIndex / 2, sourceOffset + 307) * 4;

  return Math.round(
    clamp(
      dailyBaseline +
        circadian +
        breakfast +
        lunch +
        dinner +
        dawnRise +
        activityDip +
        overnightDip +
        occasionalExcursion +
        sensorBias +
        dailySensorDrift +
        correlatedNoise,
      45,
      330,
    ),
  );
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
  state: MockRuntimeState,
  now: Date,
  source: MockCgmSource = primaryCgmSource(state) ?? "dexcom",
): number {
  const readingTime = new Date(now.getTime() - minutesAgo * MINUTE_MS);
  const base = glucoseAtTime(readingTime, source);
  const target = glucoseEventTarget(state.glucoseEvent);
  if (target === null || minutesAgo > 60) {
    return base;
  }

  const blend = 1 - minutesAgo / 60;
  return Math.round(clamp(base * (1 - blend) + target * blend, 40, 330));
}

export function buildMockDataSnapshot(
  state: MockRuntimeState,
  now = new Date(),
): MockDataSnapshot {
  const primarySource = primaryCgmSource(state);
  const iobValue = mockIobValueForEvent(state.glucoseEvent);
  if (!primarySource) {
    return {
      now,
      glucoseHistory: [],
      pumpEvents: buildPumpEvents(state, now),
      iobValue,
      glucoseUnit: state.glucoseUnit,
    };
  }

  const days = clampBackfillDays(state.cgmBackfillDays);
  const count = Math.floor((days * DAY_MS) / FIVE_MINUTES_MS);
  const source = cgmSourceKey(primarySource);
  const glucoseHistory: GlucoseHistoryReading[] = [];

  for (let index = count; index >= 0; index -= 1) {
    const minutesAgo = index * 5;
    const timestamp = new Date(now.getTime() - minutesAgo * MINUTE_MS);
    const value = mockGlucoseValueAtMinutesAgo(
      minutesAgo,
      state,
      now,
      primarySource,
    );
    const comparisonValue =
      minutesAgo === 0
        ? mockGlucoseValueAtMinutesAgo(5, state, now, primarySource)
        : mockGlucoseValueAtMinutesAgo(
            Math.max(0, minutesAgo - 5),
            state,
            now,
            primarySource,
          );
    const delta =
      minutesAgo === 0 ? value - comparisonValue : comparisonValue - value;
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
    iobValue,
    glucoseUnit: state.glucoseUnit,
  };
}

function buildPumpEvents(
  state: MockRuntimeState,
  now: Date,
): PumpEventReading[] {
  if (primaryPumpSource(state) === "none") {
    return [];
  }

  if (primaryPumpSource(state) === "mdi") {
    return buildMdiEvents(state, now);
  }

  const source = pumpSourceKey(primaryPumpSource(state));
  const days = clampBackfillDays(state.cgmBackfillDays);
  const events: PumpEventReading[] = [];

  for (let day = 0; day < days; day += 1) {
    const dayStart = new Date(now.getTime() - day * DAY_MS);
    dayStart.setHours(0, 0, 0, 0);
    const daySeed = Math.floor(dayStart.getTime() / DAY_MS);
    const manualDoseCount = seededInteger(daySeed * 17 + 211, 4, 16);
    const automatedCorrectionCount = seededInteger(daySeed * 29 + 307, 2, 14);
    const manualDoseMinutes = distributedDailyMinutes(
      manualDoseCount,
      6 * 60,
      23 * 60 + 45,
      daySeed * 43 + 401,
    );
    const automatedCorrectionMinutes = distributedDailyMinutes(
      automatedCorrectionCount,
      15,
      23 * 60 + 55,
      daySeed * 59 + 503,
    );

    manualDoseMinutes.forEach((offset, doseIndex) => {
      const timestamp = new Date(dayStart);
      timestamp.setMinutes(offset);
      if (timestamp > now) return;
      const doseSeed = daySeed * 101 + doseIndex * 17;
      const isMealDose = seededUnit(doseSeed + 601) < 0.35;
      const units = isMealDose
        ? round(2.5 + seededUnit(doseSeed + 607) * 5.5, 1)
        : round(0.4 + seededUnit(doseSeed + 613) * 2.4, 1);
      events.push({
        event_type: "bolus",
        event_timestamp: iso(timestamp),
        units,
        duration_minutes: null,
        is_automated: false,
        control_iq_reason: null,
        pump_activity_mode:
          primaryPumpSource(state) === "tandem"
            ? offset < 6 * 60
              ? "sleep"
              : offset >= 15 * 60 && offset < 18 * 60
                ? "exercise"
                : "none"
            : null,
        basal_adjustment_pct: null,
        iob_at_event: round(0.2 + seededUnit(doseSeed + 617) * 4.2, 1),
        cob_at_event: isMealDose
          ? Math.round(25 + seededUnit(doseSeed + 619) * 65)
          : null,
        bg_at_event: mockGlucoseValueAtMinutesAgo(
          Math.max(
            0,
            Math.round((now.getTime() - timestamp.getTime()) / MINUTE_MS),
          ),
          state,
          now,
        ),
        received_at: iso(new Date(timestamp.getTime() + 45_000)),
        source,
      });
    });

    automatedCorrectionMinutes.forEach((offset, correctionIndex) => {
      const timestamp = new Date(dayStart);
      timestamp.setMinutes(offset);
      if (timestamp > now) return;
      const correctionSeed = daySeed * 127 + correctionIndex * 23;
      events.push({
        event_type: "correction",
        event_timestamp: iso(timestamp),
        units: round(0.2 + seededUnit(correctionSeed + 701) * 1.6, 1),
        duration_minutes: null,
        is_automated: true,
        control_iq_reason:
          primaryPumpSource(state) === "tandem" ? "auto_correction" : null,
        pump_activity_mode:
          primaryPumpSource(state) === "tandem"
            ? offset < 6 * 60
              ? "sleep"
              : offset >= 15 * 60 && offset < 18 * 60
                ? "exercise"
                : "none"
            : null,
        basal_adjustment_pct: null,
        iob_at_event: round(0.2 + seededUnit(correctionSeed + 709) * 3.8, 1),
        cob_at_event:
          seededUnit(correctionSeed + 719) < 0.2
            ? Math.round(5 + seededUnit(correctionSeed + 727) * 20)
            : null,
        bg_at_event: mockGlucoseValueAtMinutesAgo(
          Math.max(
            0,
            Math.round((now.getTime() - timestamp.getTime()) / MINUTE_MS),
          ),
          state,
          now,
        ),
        received_at: iso(new Date(timestamp.getTime() + 45_000)),
        source,
      });
    });

    for (let hour = 0; hour < 24; hour += 3) {
      const timestamp = new Date(dayStart);
      timestamp.setHours(hour, 0, 0, 0);
      if (timestamp > now) continue;
      const isAutomated = primaryPumpSource(state) !== "mobile-plugin";
      const activityMode =
        primaryPumpSource(state) === "tandem"
          ? hour < 6
            ? "sleep"
            : hour >= 15 && hour < 18
              ? "exercise"
              : "none"
          : null;
      const minutesAgo = Math.max(
        0,
        Math.round((now.getTime() - timestamp.getTime()) / MINUTE_MS),
      );
      const bgAtEvent = mockGlucoseValueAtMinutesAgo(minutesAgo, state, now);
      const basalDelivery = basalDeliveryAtTime(
        daySeed,
        hour,
        bgAtEvent,
        isAutomated,
        activityMode,
      );
      events.push({
        event_type: "basal",
        event_timestamp: iso(timestamp),
        units: basalDelivery.rate,
        duration_minutes: 180,
        is_automated: isAutomated,
        control_iq_reason:
          primaryPumpSource(state) === "tandem" ? "scheduled" : null,
        pump_activity_mode: activityMode,
        basal_adjustment_pct: basalDelivery.adjustmentPercentage,
        iob_at_event: round(Math.max(0, 2.2 + Math.sin(hour) * 0.8), 1),
        cob_at_event: null,
        bg_at_event: bgAtEvent,
        received_at: iso(new Date(timestamp.getTime() + 45_000)),
        source,
      });
    }

    const lowExcursion = glucoseExcursionForDay(daySeed);
    if (lowExcursion?.kind !== "urgent-low") {
      continue;
    }

    const suspendTimestamp = new Date(dayStart);
    suspendTimestamp.setMinutes(Math.round(lowExcursion.centerMinute - 15));
    const resumeTimestamp = new Date(
      suspendTimestamp.getTime() + 40 * MINUTE_MS,
    );

    if (suspendTimestamp <= now) {
      events.push({
        event_type: "suspend",
        event_timestamp: iso(suspendTimestamp),
        units: null,
        duration_minutes: null,
        is_automated: primaryPumpSource(state) !== "mobile-plugin",
        control_iq_reason: "predicted_low",
        pump_activity_mode: null,
        basal_adjustment_pct: null,
        iob_at_event: 1.8,
        cob_at_event: null,
        bg_at_event: mockGlucoseValueAtMinutesAgo(
          Math.max(
            0,
            Math.round(
              (now.getTime() - suspendTimestamp.getTime()) / MINUTE_MS,
            ),
          ),
          state,
          now,
        ),
        received_at: iso(new Date(suspendTimestamp.getTime() + 45_000)),
        source,
      });
    }

    if (resumeTimestamp <= now) {
      const resumeMinuteOfDay =
        resumeTimestamp.getHours() * 60 + resumeTimestamp.getMinutes();
      const nextScheduleMinute = Math.ceil(resumeMinuteOfDay / 180) * 180;
      const resumedRate = round(
        scheduledBasalRateAtHour(resumeTimestamp.getHours()) * 0.65,
        2,
      );
      const sharedResumeData = {
        event_timestamp: iso(resumeTimestamp),
        duration_minutes: null,
        is_automated: primaryPumpSource(state) !== "mobile-plugin",
        pump_activity_mode: null,
        basal_adjustment_pct: null,
        iob_at_event: 1.6,
        cob_at_event: null,
        bg_at_event: mockGlucoseValueAtMinutesAgo(
          Math.max(
            0,
            Math.round((now.getTime() - resumeTimestamp.getTime()) / MINUTE_MS),
          ),
          state,
          now,
        ),
        received_at: iso(new Date(resumeTimestamp.getTime() + 45_000)),
        source,
      };
      events.push({
        ...sharedResumeData,
        event_type: "resume",
        units: null,
        control_iq_reason: "resume",
      });
      events.push({
        ...sharedResumeData,
        event_type: "basal",
        units: resumedRate,
        duration_minutes: Math.max(5, nextScheduleMinute - resumeMinuteOfDay),
        control_iq_reason: "scheduled",
      });
    }
  }

  return events.sort(
    (left, right) =>
      new Date(left.event_timestamp).getTime() -
      new Date(right.event_timestamp).getTime(),
  );
}

function buildMdiEvents(
  state: MockRuntimeState,
  now: Date,
): PumpEventReading[] {
  const days = clampBackfillDays(state.cgmBackfillDays);
  const cutoff = now.getTime() - days * DAY_MS;
  const events: PumpEventReading[] = [];
  const source = pumpSourceKey(primaryPumpSource(state));

  const addEvent = (
    timestamp: Date,
    eventType: "bolus" | "basal_injection",
    units: number,
    mealIndex?: number,
  ) => {
    if (timestamp.getTime() <= cutoff || timestamp > now) return;

    const minutesAgo = Math.max(
      0,
      Math.round((now.getTime() - timestamp.getTime()) / MINUTE_MS),
    );
    events.push({
      event_type: eventType,
      event_timestamp: iso(timestamp),
      units,
      duration_minutes: null,
      is_automated: false,
      control_iq_reason: null,
      pump_activity_mode: null,
      basal_adjustment_pct: null,
      iob_at_event:
        eventType === "bolus"
          ? round(Math.max(0, 2.4 - (mealIndex ?? 0) * 0.6), 1)
          : null,
      cob_at_event: eventType === "bolus" ? 38 + (mealIndex ?? 0) * 12 : null,
      bg_at_event: mockGlucoseValueAtMinutesAgo(minutesAgo, state, now),
      received_at: iso(new Date(timestamp.getTime() + 45_000)),
      source,
    });
  };

  for (let day = 0; day <= days; day += 1) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() - day);
    dayStart.setHours(0, 0, 0, 0);

    [8 * 60 + 15, 12 * 60 + 30, 18 * 60 + 45].forEach((offset, mealIndex) => {
      const timestamp = new Date(dayStart);
      timestamp.setMinutes(offset);
      addEvent(
        timestamp,
        "bolus",
        round(3.8 + mealIndex * 1.3 + (day % 3) * 0.2, 1),
        mealIndex,
      );
    });

    const basalInjectionTimestamp = new Date(dayStart);
    basalInjectionTimestamp.setHours(22, 0, 0, 0);
    addEvent(basalInjectionTimestamp, "basal_injection", 24);
  }

  return events.sort(
    (left, right) =>
      new Date(left.event_timestamp).getTime() -
      new Date(right.event_timestamp).getTime(),
  );
}

function filterReadings(
  snapshot: MockDataSnapshot,
  params: URLSearchParams,
  defaultLimit?: number,
): GlucoseHistoryReading[] {
  const start = params.get("start");
  const end = params.get("end");
  const minutes = Number(params.get("minutes") ?? "1440");
  const limitParam = params.get("limit");
  const parsedLimit = limitParam === null ? defaultLimit : Number(limitParam);
  const limit =
    parsedLimit === undefined
      ? null
      : Math.max(
          1,
          Math.min(
            10_000,
            Number.isFinite(parsedLimit)
              ? parsedLimit
              : (defaultLimit ?? 10_000),
          ),
        );

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
      (reading) => new Date(reading.reading_timestamp).getTime() >= cutoff,
    );
  }

  return limit === null ? readings : readings.slice(-limit);
}

function filterPumpEvents(
  snapshot: MockDataSnapshot,
  params: URLSearchParams,
): PumpEventReading[] {
  const minutes = Number(params.get("minutes") ?? "1440");
  const limit = Math.max(
    1,
    Math.min(10_000, Number(params.get("limit") ?? "500")),
  );
  const cutoff = snapshot.now.getTime() - minutes * MINUTE_MS;
  return snapshot.pumpEvents
    .filter((event) => new Date(event.event_timestamp).getTime() >= cutoff)
    .slice(-limit);
}

export function buildGlucoseHistoryResponse(
  snapshot: MockDataSnapshot,
  params: URLSearchParams,
): GlucoseHistoryResponse {
  const readings = filterReadings(snapshot, params, 288);
  return { readings, count: readings.length };
}

export function buildPumpEventHistoryResponse(
  snapshot: MockDataSnapshot,
  params: URLSearchParams,
): PumpEventHistoryResponse {
  const events = filterPumpEvents(snapshot, params);
  return { events, count: events.length };
}

export function buildGlucoseStats(
  snapshot: MockDataSnapshot,
  params: URLSearchParams,
): GlucoseStats {
  const readings = filterReadings(snapshot, params);
  const values = readings.map((reading) => reading.value);
  const count = values.length || 1;
  const mean = values.reduce((sum, value) => sum + value, 0) / count;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / count;
  const bounds = values.reduce(
    (range, value) => ({
      min: Math.min(range.min, value),
      max: Math.max(range.max, value),
    }),
    { min: Infinity, max: -Infinity },
  );
  const periodMinutes =
    params.get("start") && params.get("end")
      ? Math.max(
          0,
          Math.round(
            (new Date(params.get("end") as string).getTime() -
              new Date(params.get("start") as string).getTime()) /
              MINUTE_MS,
          ),
        )
      : Number(params.get("minutes") ?? "1440");

  return {
    mean_glucose: Math.round(mean),
    std_dev: round(Math.sqrt(variance), 1),
    min_glucose: values.length > 0 ? bounds.min : 0,
    max_glucose: values.length > 0 ? bounds.max : 0,
    cv_pct: mean > 0 ? round((Math.sqrt(variance) / mean) * 100, 1) : 0,
    gmi: round(3.31 + 0.02392 * mean, 1),
    cgm_active_pct: readings.length > 0 ? 96 : 0,
    readings_count: readings.length,
    period_minutes: periodMinutes,
  };
}

export function buildTimeInRangeDetail(
  snapshot: MockDataSnapshot,
  params: URLSearchParams,
): TimeInRangeDetailStats {
  const readings = filterReadings(snapshot, params);
  const total = readings.length || 1;
  const buckets = [
    {
      label: "urgent_low" as const,
      threshold_low: null,
      threshold_high: TARGET_RANGE.urgentLow,
      values: readings.filter(
        (reading) => reading.value < TARGET_RANGE.urgentLow,
      ),
    },
    {
      label: "low" as const,
      threshold_low: TARGET_RANGE.urgentLow,
      threshold_high: TARGET_RANGE.low,
      values: readings.filter(
        (reading) =>
          reading.value >= TARGET_RANGE.urgentLow &&
          reading.value < TARGET_RANGE.low,
      ),
    },
    {
      label: "in_range" as const,
      threshold_low: TARGET_RANGE.low,
      threshold_high: TARGET_RANGE.high,
      values: readings.filter(
        (reading) =>
          reading.value >= TARGET_RANGE.low &&
          reading.value <= TARGET_RANGE.high,
      ),
    },
    {
      label: "high" as const,
      threshold_low: TARGET_RANGE.high,
      threshold_high: TARGET_RANGE.urgentHigh,
      values: readings.filter(
        (reading) =>
          reading.value > TARGET_RANGE.high &&
          reading.value <= TARGET_RANGE.urgentHigh,
      ),
    },
    {
      label: "urgent_high" as const,
      threshold_low: TARGET_RANGE.urgentHigh,
      threshold_high: null,
      values: readings.filter(
        (reading) => reading.value > TARGET_RANGE.urgentHigh,
      ),
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
    Math.max(0, Math.floor((pct / 100) * sorted.length)),
  );
  return sorted[index];
}

export function buildGlucosePercentiles(
  snapshot: MockDataSnapshot,
  params: URLSearchParams,
): GlucosePercentilesResponse {
  const days = Number(params.get("days") ?? "14");
  const start = snapshot.now.getTime() - days * DAY_MS;
  const readings = snapshot.glucoseHistory.filter(
    (reading) => new Date(reading.reading_timestamp).getTime() >= start,
  );
  const buckets = Array.from({ length: 24 }, (_, hour) => {
    const values = readings
      .filter(
        (reading) => new Date(reading.reading_timestamp).getHours() === hour,
      )
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

function insulinEventWindow(
  snapshot: MockDataSnapshot,
  params: URLSearchParams,
  defaultDays: number,
  maxDays: number,
): { events: PumpEventReading[]; periodDays: number } {
  const requestedDays = Number(params.get("days") ?? String(defaultDays));
  const fallbackDays = Number.isFinite(requestedDays)
    ? clamp(Math.round(requestedDays), 1, maxDays)
    : defaultDays;
  const requestedStart = params.get("start");
  const requestedEnd = params.get("end");
  const parsedStart = requestedStart ? new Date(requestedStart).getTime() : NaN;
  const parsedEnd = requestedEnd ? new Date(requestedEnd).getTime() : NaN;
  const hasDateRange =
    Number.isFinite(parsedStart) &&
    Number.isFinite(parsedEnd) &&
    parsedEnd >= parsedStart;
  const endTime = hasDateRange ? parsedEnd : snapshot.now.getTime();
  const startTime = hasDateRange
    ? parsedStart
    : endTime - fallbackDays * DAY_MS;
  const periodDays = hasDateRange
    ? Math.max(1, Math.round((endTime - startTime) / DAY_MS))
    : fallbackDays;

  return {
    events: snapshot.pumpEvents.filter((event) => {
      const timestamp = new Date(event.event_timestamp).getTime();
      return timestamp >= startTime && timestamp <= endTime;
    }),
    periodDays,
  };
}

export function buildInsulinSummary(
  snapshot: MockDataSnapshot,
  params: URLSearchParams,
): InsulinSummaryResponse {
  const { events, periodDays } = insulinEventWindow(snapshot, params, 14, 90);
  const boluses = events.filter((event) => event.event_type === "bolus");
  const corrections = events.filter(
    (event) => event.event_type === "correction",
  );
  const basalEvents = events.filter((event) => event.event_type === "basal");
  const basalInjections = events.filter(
    (event) => event.event_type === "basal_injection",
  );
  const bolusUnits = [...boluses, ...corrections].reduce(
    (sum, event) => sum + (event.units ?? 0),
    0,
  );
  const correctionUnits = corrections.reduce(
    (sum, event) => sum + (event.units ?? 0),
    0,
  );
  const basalUnits = basalEvents.reduce(
    (sum, event) =>
      sum + (event.units ?? 0) * ((event.duration_minutes ?? 0) / 60),
    0,
  );
  const basalInjectionUnits = basalInjections.reduce(
    (sum, event) => sum + (event.units ?? 0),
    0,
  );
  const total = bolusUnits + basalUnits + basalInjectionUnits;
  const divisor = Math.max(1, periodDays);

  return {
    tdd: round(total / divisor, 1),
    basal_units: round(basalUnits / divisor, 1),
    basal_injection_units: round(basalInjectionUnits / divisor, 1),
    basal_injection_count: basalInjections.length,
    bolus_units: round(bolusUnits / divisor, 1),
    correction_units: round(correctionUnits / divisor, 1),
    basal_pct:
      total > 0
        ? round(((basalUnits + basalInjectionUnits) / total) * 100, 1)
        : 0,
    bolus_pct: total > 0 ? round((bolusUnits / total) * 100, 1) : 0,
    bolus_count: boluses.length,
    correction_count: corrections.length,
    period_days: periodDays,
  };
}

function getBriefReadings(
  snapshot: MockDataSnapshot,
  hours: number,
): GlucoseHistoryReading[] {
  const start = snapshot.now.getTime() - hours * 60 * MINUTE_MS;
  return snapshot.glucoseHistory.filter(
    (reading) => new Date(reading.reading_timestamp).getTime() >= start,
  );
}

function getBriefPumpEvents(
  snapshot: MockDataSnapshot,
  hours: number,
): PumpEventReading[] {
  const start = snapshot.now.getTime() - hours * 60 * MINUTE_MS;
  return snapshot.pumpEvents.filter(
    (event) => new Date(event.event_timestamp).getTime() >= start,
  );
}

function buildDailyBriefSummary(
  state: MockRuntimeState,
  brief: Omit<MockDailyBriefResponse, "ai_summary">,
): string {
  const cgmSources =
    state.cgmSources.map(cgmLabel).join(", ") || "no CGM source";
  const pumpSources = state.pumpSources.map(pumpSourceKey).join(", ");
  const highLowText =
    brief.low_count > 0 || brief.high_count > 0
      ? `${brief.low_count} low readings and ${brief.high_count} high readings showed up in the window.`
      : "No low or high readings stood out in this window.";
  const insulinText =
    primaryPumpSource(state) === "mdi"
      ? `Manual insulin pen events contributed ${brief.total_insulin ?? 0} units of insulin context without pump telemetry.`
      : hasPumpTelemetry(primaryPumpSource(state))
        ? `Pump data from ${pumpSourceKey(primaryPumpSource(state))} contributed ${brief.correction_count} correction events and ${brief.total_insulin ?? 0} units of insulin context.`
        : "No pump telemetry or insulin events were connected, so insulin context is limited.";
  const insulinSource =
    primaryPumpSource(state) === "mdi"
      ? "insulin pens (MDI)"
      : hasPumpTelemetry(primaryPumpSource(state))
        ? pumpSourceKey(primaryPumpSource(state))
        : "no insulin source";

  return [
    `## Mock daily brief`,
    "",
    `Time in range was ${brief.time_in_range_pct}% with an average glucose of ${brief.average_glucose} mg/dL across ${brief.readings_count} CGM readings.`,
    "",
    highLowText,
    "",
    insulinText,
    "",
    `The active mock sources are ${cgmSources} for CGM and ${pumpSources || insulinSource} for insulin data.`,
    "",
    "Safety Notice: This mock brief is generated for development testing only and is not medical advice.",
  ].join("\n");
}

export function buildMockDailyBrief(
  state: MockRuntimeState,
  snapshot: MockDataSnapshot,
  hours = 24,
  id = createMockId(),
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
    (reading) =>
      reading.value >= TARGET_RANGE.low && reading.value <= TARGET_RANGE.high,
  ).length;
  const bolusEvents = events.filter(
    (event) =>
      event.event_type === "bolus" || event.event_type === "correction",
  );
  const basalUnits = events
    .filter((event) => event.event_type === "basal")
    .reduce(
      (sum, event) =>
        sum + (event.units ?? 0) * ((event.duration_minutes ?? 0) / 60),
      0,
    );
  const basalInjectionUnits = events
    .filter((event) => event.event_type === "basal_injection")
    .reduce((sum, event) => sum + (event.units ?? 0), 0);
  const bolusUnits = bolusEvents.reduce(
    (sum, event) => sum + (event.units ?? 0),
    0,
  );
  const periodEnd = snapshot.now;
  const periodStart = new Date(
    periodEnd.getTime() - safeHours * 60 * MINUTE_MS,
  );

  const briefWithoutSummary = {
    id,
    period_start: iso(periodStart),
    period_end: iso(periodEnd),
    time_in_range_pct: round((inRangeCount / readingCount) * 100, 1),
    average_glucose: averageGlucose,
    low_count: readings.filter((reading) => reading.value < TARGET_RANGE.low)
      .length,
    high_count: readings.filter((reading) => reading.value > TARGET_RANGE.high)
      .length,
    readings_count: readings.length,
    correction_count: events.filter(
      (event) => event.event_type === "correction",
    ).length,
    total_insulin:
      primaryPumpSource(state) === "none"
        ? null
        : round(basalUnits + basalInjectionUnits + bolusUnits, 1),
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
    [],
  );
}

function setStoredMockDailyBriefs(briefs: MockDailyBriefResponse[]): void {
  if (!hasWindow()) return;
  window.localStorage.setItem(
    MOCK_DAILY_BRIEFS_STORAGE_KEY,
    JSON.stringify(briefs.slice(0, 50)),
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
    {},
  );
}

function setStoredInsightResponses(
  responses: Record<string, MockInsightResponse>,
): void {
  if (!hasWindow()) return;
  window.localStorage.setItem(
    MOCK_INSIGHT_RESPONSES_STORAGE_KEY,
    JSON.stringify(responses),
  );
}

export function generateAndStoreMockDailyBrief(
  state: MockRuntimeState,
  snapshot: MockDataSnapshot,
  hours = 24,
): MockDailyBriefResponse {
  const brief = buildMockDailyBrief(state, snapshot, hours);
  const stored = getStoredMockDailyBriefs().filter(
    (item) => item.id !== brief.id,
  );
  setStoredMockDailyBriefs([brief, ...stored]);
  return brief;
}

function getMockDailyBriefs(
  state: MockRuntimeState,
  snapshot: MockDataSnapshot,
): MockDailyBriefResponse[] {
  const stored = getStoredMockDailyBriefs();
  if (stored.length > 0) {
    return stored;
  }

  return [buildMockDailyBrief(state, snapshot, 24, MOCK_SEEDED_BRIEF_ID)];
}

function briefTitle(brief: MockDailyBriefResponse): string {
  return `Daily brief for ${new Date(brief.period_end).toLocaleDateString(
    "en-US",
    {
      month: "short",
      day: "numeric",
    },
  )}`;
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
  params: URLSearchParams,
): InsightsListResponse {
  const limit = Math.max(1, Math.min(100, Number(params.get("limit") ?? "10")));
  const insights = getMockDailyBriefs(state, snapshot)
    .map(briefToInsight)
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime(),
    );

  return {
    insights: insights.slice(0, limit),
    total: insights.length,
  };
}

export function buildMockUnreadInsightCount(
  state: MockRuntimeState,
  snapshot: MockDataSnapshot,
): { unread_count: number } {
  return {
    unread_count: getMockDailyBriefs(state, snapshot).filter(
      (brief) => briefStatus(brief) === "pending",
    ).length,
  };
}

export function findMockDailyBrief(
  state: MockRuntimeState,
  snapshot: MockDataSnapshot,
  briefId: string,
): MockDailyBriefResponse | null {
  return (
    getMockDailyBriefs(state, snapshot).find((brief) => brief.id === briefId) ??
    null
  );
}

export function buildMockInsightDetail(
  state: MockRuntimeState,
  snapshot: MockDataSnapshot,
  briefId: string,
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
      cgm_source: state.cgmSources[0]
        ? cgmLabel(state.cgmSources[0])
        : "No CGM",
      pump_source: hasPumpTelemetry(primaryPumpSource(state))
        ? pumpSourceKey(primaryPumpSource(state))
        : "No pump",
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
  now = new Date(),
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
  state: MockRuntimeState,
  snapshot: MockDataSnapshot,
  params: URLSearchParams,
): BolusReviewResponse {
  const requestedLimit = Number(params.get("limit") ?? "100");
  const requestedOffset = Number(params.get("offset") ?? "0");
  const limit = Number.isFinite(requestedLimit)
    ? clamp(Math.round(requestedLimit), 1, 500)
    : 100;
  const offset = Number.isFinite(requestedOffset)
    ? Math.max(0, Math.round(requestedOffset))
    : 0;
  const { events, periodDays } = insulinEventWindow(snapshot, params, 7, 30);
  const reviewEvents = events
    .filter(
      (event) =>
        event.event_type === "bolus" ||
        event.event_type === "correction" ||
        event.event_type === "basal_injection",
    )
    .reverse();
  const boluses: BolusReviewItem[] = reviewEvents
    .slice(offset, offset + limit)
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

  // GLY-270: gives the DevMockPanel a live entry point for
  // `bolusReviewUnknownEventTypeFixture`, which otherwise only unit tests
  // exercised. Appended after pagination so the scenario is always visible
  // without disturbing the windowed/paginated bolus/correction rows above.
  if (state.bolusReviewIncludeUnknownEventType) {
    boluses.push(bolusReviewUnknownEventTypeFixture);
  }

  return {
    boluses,
    total_count: reviewEvents.length + (state.bolusReviewIncludeUnknownEventType ? 1 : 0),
    period_days: periodDays,
  };
}

export function buildPumpStatus(
  state: MockRuntimeState,
  snapshot: MockDataSnapshot,
): PumpStatusResponse {
  if (!hasPumpTelemetry(primaryPumpSource(state))) {
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
  const engine = forecastEngine(primaryPumpSource(state));
  return {
    basal: {
      rate: primaryPumpSource(state) === "tandem" ? 0.92 : 0.74,
      is_automated: primaryPumpSource(state) !== "mobile-plugin",
      timestamp,
    },
    battery: {
      percentage: primaryPumpSource(state) === "omnipod-glooko" ? 78 : 64,
      is_charging: false,
      timestamp,
    },
    reservoir: {
      units_remaining: primaryPumpSource(state) === "omnipod-glooko" ? 92 : 128,
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
      primaryPumpSource(state) === "loop-nightscout"
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
  snapshot: MockDataSnapshot,
): ForecastReadResponse {
  const preference = state.forecastSourcePreference;
  const availableSources = availableForecastEngines(state);
  const cgmSource = primaryCgmSource(state);
  const engine = effectiveForecastEngine(preference, availableSources);
  if (!engine || !cgmSource) {
    const forecastUnavailableReason =
      preference === "none"
        ? "opted_out"
        : availableSources.length === 0
          ? "no_sources"
          : preference === "auto"
            ? "needs_pick"
            : "source_silent";

    return {
      source_preference: preference,
      effective_source: null,
      available_sources: availableSources,
      forecast: null,
      forecast_unavailable_reason: forecastUnavailableReason,
    };
  }

  const current = snapshot.glucoseHistory.at(-1)?.value ?? 120;
  const main = Array.from({ length: 13 }, (_, index) =>
    Math.round(current + Math.sin(index / 2) * 11 - index * 1.2),
  );

  return {
    source_preference: preference,
    effective_source: engine,
    available_sources: availableSources,
    forecast: {
      source_engine: engine,
      source_uploader: cgmLabel(cgmSource),
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
  now: Date,
): IntegrationListResponse {
  const dexcomConnected = state.cgmSources.includes("dexcom");
  const tandemConnected = state.pumpSources.includes("tandem");
  const createdAt = iso(new Date(now.getTime() - 21 * DAY_MS));
  const updatedAt = iso(now);
  const integration = (
    integration_type: IntegrationResponse["integration_type"],
    connected: boolean,
    region: string | null,
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
  now: Date,
): NightscoutConnectionListResponse {
  const usesNightscout =
    state.cgmSources.some((source) => source.startsWith("nightscout")) ||
    state.pumpSources.some((source) => source.endsWith("nightscout"));
  if (!usesNightscout) {
    return { connections: [] };
  }

  const uploader =
    state.cgmSources.includes("nightscout-aaps") ||
    state.pumpSources.includes("aaps-nightscout")
      ? "aaps"
      : state.cgmSources.includes("nightscout-trio") ||
          state.pumpSources.includes("trio-nightscout")
        ? "trio"
        : state.cgmSources.includes("nightscout-oref0") ||
            state.pumpSources.includes("oref0-nightscout")
          ? "oref0"
          : "loop";

  const cgmSource = primaryCgmSource(state);
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
      cgm: cgmSource ? cgmLabel(cgmSource) : "none",
      pump: hasPumpTelemetry(primaryPumpSource(state))
        ? pumpSourceKey(primaryPumpSource(state))
        : "none",
    },
    last_evaluated_at: iso(now),
    created_at: iso(new Date(now.getTime() - 30 * DAY_MS)),
    updated_at: iso(now),
  };

  return { connections: [connection] };
}

export function buildCgmSources(state: MockRuntimeState): CgmSourcesResponse {
  const primarySource = primaryCgmSource(state);
  const primary = primarySource ? cgmSourceKey(primarySource) : null;
  const sources: CgmSourcesResponse["sources"] = state.cgmSources.map(
    (source, index) => ({
      source: cgmSourceKey(source),
      label: cgmLabel(source),
      role: index === 0 ? ("primary" as const) : ("secondary" as const),
      kind: source.startsWith("nightscout") ? "nightscout" : "dexcom",
    }),
  );

  return {
    sources,
    primary_source: primary,
    multiple_sources: sources.length > 1,
  };
}

export function buildTandemSyncStatus(
  state: MockRuntimeState,
  now: Date,
): TandemSyncStatusResponse {
  const connected = state.pumpSources.includes("tandem");
  return {
    integration_status: connected ? "connected" : "disconnected",
    last_sync_at: connected ? iso(now) : null,
    last_error:
      connected &&
      state.tandemSyncEnabled &&
      state.tandemAutomaticSyncShouldFail
        ? "Scheduled Tandem sync could not reach t:connect. Check your connection and try again."
        : null,
    events_available: connected ? 480 : 0,
    enabled: connected && state.tandemSyncEnabled,
    sync_interval_minutes: state.tandemSyncIntervalMinutes,
    events_pulled_total: connected ? 12_840 : 0,
    needs_country_reselect: false,
  };
}

export function buildMedtronicConnectStatus(
  state: MockRuntimeState,
  now: Date,
): MedtronicConnectStatus {
  const connected = state.pumpSources.includes("medtronic-connect");
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
  now: Date,
): GlookoStatus {
  const connected =
    state.pumpSources.includes("omnipod-glooko") ||
    state.cgmSources.includes("glooko");
  return {
    connected,
    status: connected ? "connected" : "not_configured",
    enabled: connected,
    cgm_sync_enabled: state.cgmSources.includes("glooko"),
    region: connected ? "us" : null,
    sync_interval_minutes: connected ? 30 : 15,
    last_sync_at: connected ? iso(now) : null,
    last_error: null,
    readings_synced_total: connected ? 8_640 : 0,
    consent_acknowledged_at: connected
      ? iso(new Date(now.getTime() - DAY_MS))
      : null,
  };
}

export function buildUser(
  now: Date,
  state?: MockRuntimeState,
): CurrentUserResponse {
  const userRole = state?.userRole ?? "diabetic";
  return {
    id: userRole === "caregiver" ? "mock-caregiver" : "mock-user",
    email:
      userRole === "caregiver"
        ? "mock.caregiver@glycemicgpt.local"
        : "mock.patient@glycemicgpt.local",
    display_name: state ? state.displayName : "Mock Patient",
    role: userRole,
    is_active: true,
    email_verified: true,
    disclaimer_acknowledged: true,
    disclaimer_version: "dev-mock",
    glucose_unit: state?.glucoseUnit ?? "mgdl",
    glucose_unit_source: "user",
    meal_intelligence_enabled: true,
    created_at: iso(new Date(now.getTime() - 90 * DAY_MS)),
  };
}

/**
 * Alert generation, ported from `apps/api/src/services/predictive_alerts.py`
 * (`PREDICTION_HORIZONS`, `calculate_trajectory`, `check_threshold_crossings`,
 * `determine_severity`, `ALERT_EXPIRY_MINUTES`).
 *
 * The values matter as much as the shape: `alert_type` must be an `AlertType`
 * member and `source` one of `predictive` / `current` / `iob`, because the
 * dashboard branches on both (`alert-card.tsx` renders `iob_warning` and
 * `no_data` differently, `alert-utils.ts` picks the icon and title from
 * `alert_type`). Invented values like `low_glucose` or a CGM name in `source`
 * type-check fine -- the backend publishes both as plain strings -- while
 * making real UI branches unreachable under mocks.
 */
const PREDICTION_HORIZONS = [20, 30, 45] as const;
const ALERT_EXPIRY_MINUTES = 60;
const IOB_ESCALATION_FACTOR = 0.8;
const MOCK_IOB_WARNING_UNITS = 6;
// Below `MOCK_IOB_WARNING_UNITS * IOB_ESCALATION_FACTOR` (4.8): the
// non-escalating baseline used outside a falling-glucose scenario.
const MOCK_IOB_BASELINE_UNITS = 1.8;
// At or above the escalation bar: a still-active bolus during a falling
// scenario, so `mockAlertSeverity`'s escalation branch is reachable under
// mocks (warning -> urgent for "low", urgent -> emergency for "urgent-low").
const MOCK_IOB_ESCALATED_UNITS = 5.2;

/** Mirrors the correlation `determine_severity` exists for: a falling/low
 * glucose scenario is modeled with a still-active bolus, so severity
 * escalation is reachable the same way the backend reaches it. */
function mockIobValueForEvent(event: MockGlucoseEvent): number {
  return event === "low" || event === "urgent-low"
    ? MOCK_IOB_ESCALATED_UNITS
    : MOCK_IOB_BASELINE_UNITS;
}

type MockAlertType =
  | "low_urgent"
  | "low_warning"
  | "high_warning"
  | "high_urgent";
type MockAlertSeverity = "info" | "warning" | "urgent" | "emergency";

// Deterministic but UUID-shaped, like the real `Alert.id` the dashboard keys
// acknowledgement off.
const MOCK_ALERT_IDS: Record<MockAlertType, string> = {
  low_urgent: "00000000-0000-4000-8000-00000000a001",
  low_warning: "00000000-0000-4000-8000-00000000a002",
  high_warning: "00000000-0000-4000-8000-00000000a003",
  high_urgent: "00000000-0000-4000-8000-00000000a004",
};

/** Mirrors `determine_severity`: base severity by type, escalated one step
 * when glucose is falling with enough insulin still on board. */
function mockAlertSeverity(
  alertType: MockAlertType,
  iobValue: number | null,
  iobThreshold: number,
): MockAlertSeverity {
  const base: MockAlertSeverity =
    alertType === "low_urgent" || alertType === "high_urgent"
      ? "urgent"
      : "warning";
  const isLow = alertType === "low_urgent" || alertType === "low_warning";
  if (
    isLow &&
    iobValue !== null &&
    iobValue >= iobThreshold * IOB_ESCALATION_FACTOR
  ) {
    return base === "warning" ? "urgent" : "emergency";
  }
  return base;
}

/** Mirrors `format_glucose_value`: the bare number in the display unit, no
 * label -- mg/dL renders as a whole number, mmol/L to one decimal. */
function bareGlucoseText(valueMgdl: number, unit: GlucoseUnit): string {
  return formatGlucose(valueMgdl, unit);
}

/** Mirrors `format_glucose`: the bare number plus its unit label,
 * e.g. `"120 mg/dL"` or `"6.7 mmol/L"`. */
function labeledGlucoseText(valueMgdl: number, unit: GlucoseUnit): string {
  return `${formatGlucose(valueMgdl, unit)} ${unitLabel(unit)}`;
}

export function buildActiveAlerts(
  snapshot: MockDataSnapshot,
): ActiveAlertsResponse {
  const latest = snapshot.glucoseHistory.at(-1);
  if (!latest) {
    return { alerts: [], count: 0 };
  }

  const current = latest.value;
  const trendRate = latest.trend_rate ?? 0;
  const iobValue = snapshot.iobValue;
  const unit = snapshot.glucoseUnit;
  const createdAt = iso(snapshot.now);
  const expiresAt = iso(
    new Date(snapshot.now.getTime() + ALERT_EXPIRY_MINUTES * MINUTE_MS),
  );
  // Pre-render the message figures in the patient's unit once, mirroring
  // `check_threshold_crossings` -- numeric response fields below stay
  // canonical mg/dL; only this text renders in `unit`.
  const currentLabeled = labeledGlucoseText(current, unit);
  const currentBare = bareGlucoseText(current, unit);
  const urgentLowDisp = bareGlucoseText(TARGET_RANGE.urgentLow, unit);
  const lowWarningDisp = bareGlucoseText(TARGET_RANGE.low, unit);
  const urgentHighDisp = bareGlucoseText(TARGET_RANGE.urgentHigh, unit);
  const highWarningDisp = bareGlucoseText(TARGET_RANGE.high, unit);

  const alerts: ActiveAlertsResponse["alerts"] = [];
  const raised = new Set<MockAlertType>();

  const raise = (
    alertType: MockAlertType,
    message: string,
    source: "predictive" | "current",
    predictedValue: number | null,
    predictionMinutes: number | null,
  ): void => {
    alerts.push({
      id: MOCK_ALERT_IDS[alertType],
      alert_type: alertType,
      severity: mockAlertSeverity(alertType, iobValue, MOCK_IOB_WARNING_UNITS),
      current_value: current,
      predicted_value: predictedValue,
      prediction_minutes: predictionMinutes,
      iob_value: iobValue,
      message,
      trend_rate: latest.trend_rate,
      source,
      acknowledged: false,
      acknowledged_at: null,
      created_at: createdAt,
      expires_at: expiresAt,
    });
    raised.add(alertType);
  };

  // Current value against the thresholds -- no prediction on these, exactly as
  // the engine emits them.
  if (current <= TARGET_RANGE.urgentLow) {
    raise(
      "low_urgent",
      `Urgent low glucose: ${currentLabeled} (threshold: ${urgentLowDisp})`,
      "current",
      null,
      null,
    );
  } else if (current <= TARGET_RANGE.low) {
    raise(
      "low_warning",
      `Low glucose warning: ${currentLabeled} (threshold: ${lowWarningDisp})`,
      "current",
      null,
      null,
    );
  } else if (current >= TARGET_RANGE.urgentHigh) {
    raise(
      "high_urgent",
      `Urgent high glucose: ${currentLabeled} (threshold: ${urgentHighDisp})`,
      "current",
      null,
      null,
    );
  } else if (current >= TARGET_RANGE.high) {
    raise(
      "high_warning",
      `High glucose warning: ${currentLabeled} (threshold: ${highWarningDisp})`,
      "current",
      null,
      null,
    );
  }

  // Linear projection at each horizon, earliest crossing first; a type already
  // raised from the current value is not raised again.
  for (const minutes of PREDICTION_HORIZONS) {
    const predicted = round(Math.max(0, current + trendRate * minutes));
    const predictedLabeled = labeledGlucoseText(predicted, unit);

    if (predicted <= TARGET_RANGE.urgentLow && !raised.has("low_urgent")) {
      raise(
        "low_urgent",
        `Predicted urgent low: ${predictedLabeled} in ${minutes} min ` +
          `(current: ${currentBare}, threshold: ${urgentLowDisp})`,
        "predictive",
        predicted,
        minutes,
      );
    } else if (
      predicted <= TARGET_RANGE.low &&
      !raised.has("low_warning") &&
      !raised.has("low_urgent")
    ) {
      raise(
        "low_warning",
        `Predicted low glucose: ${predictedLabeled} in ${minutes} min ` +
          `(current: ${currentBare}, threshold: ${lowWarningDisp})`,
        "predictive",
        predicted,
        minutes,
      );
    }

    if (predicted >= TARGET_RANGE.urgentHigh && !raised.has("high_urgent")) {
      raise(
        "high_urgent",
        `Predicted urgent high: ${predictedLabeled} in ${minutes} min ` +
          `(current: ${currentBare}, threshold: ${urgentHighDisp})`,
        "predictive",
        predicted,
        minutes,
      );
    } else if (
      predicted >= TARGET_RANGE.high &&
      !raised.has("high_warning") &&
      !raised.has("high_urgent")
    ) {
      raise(
        "high_warning",
        `Predicted high glucose: ${predictedLabeled} in ${minutes} min ` +
          `(current: ${currentBare}, threshold: ${highWarningDisp})`,
        "predictive",
        predicted,
        minutes,
      );
    }
  }

  return { alerts, count: alerts.length };
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

export function buildMedtronicAvailability(
  now: Date,
): MedtronicAvailabilityResponse {
  return {
    start: iso(new Date(now.getTime() - 30 * DAY_MS)),
    end: iso(now),
  };
}

export function buildGlookoAvailability(
  state: MockRuntimeState,
  now: Date,
): GlookoAvailability {
  const connected =
    state.pumpSources.includes("omnipod-glooko") ||
    state.cgmSources.includes("glooko");
  return {
    connected,
    cgm_available: state.cgmSources.includes("glooko"),
    earliest: connected ? iso(new Date(now.getTime() - 30 * DAY_MS)) : null,
    latest: connected ? iso(now) : null,
  };
}

export function buildSyncResponse(
  snapshot: MockDataSnapshot,
): TandemSyncResponse {
  return {
    message: "Mock sync complete",
    events_fetched: snapshot.pumpEvents.length,
    events_stored: snapshot.pumpEvents.length,
    profiles_stored: 1,
  };
}

export function buildNightscoutSyncResponse(
  state: MockRuntimeState,
): NightscoutManualSyncResponse {
  return {
    connection_id: "mock-nightscout-primary",
    status: "ok",
    entries_inserted: clampBackfillDays(state.cgmBackfillDays) * 288,
    entries_skipped: 0,
    entries_failed: 0,
    treatments_inserted_pump: state.pumpSources.some((source) =>
      source.endsWith("nightscout"),
    )
      ? 120
      : 0,
    treatments_inserted_glucose: 0,
    treatments_failed: 0,
    devicestatuses_inserted: state.pumpSources.some((source) =>
      source.endsWith("nightscout"),
    )
      ? 96
      : 0,
    devicestatuses_failed: 0,
    profile_synced: state.pumpSources.some((source) =>
      source.endsWith("nightscout"),
    ),
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
