import {
  buildActiveAlerts,
  buildBolusReview,
  buildCgmSources,
  buildForecast,
  buildGlucoseHistoryResponse,
  buildGlucoseStats,
  buildInsulinSummary,
  buildMockInsightDetail,
  buildMockInsights,
  buildMockUnreadInsightCount,
  buildMockDataSnapshot,
  buildPumpStatus,
  buildTimeInRangeDetail,
  generateAndStoreMockDailyBrief
} from "./data";
import { MOCK_CGM_BACKFILL_MAX_DAYS, type MockRuntimeState } from "./types";

const baseState: MockRuntimeState = {
  enabled: true,
  cgmSource: "nightscout-trio",
  pumpSource: "trio-nightscout",
  cgmBackfillDays: 30,
  liveMode: true,
  glucoseEvent: "baseline",
  glucoseUnit: "mgdl",
  updatedAt: "2026-07-06T12:00:00.000Z"
};

describe("mock data generator", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("builds a 30 day CGM backfill at five minute cadence", () => {
    const snapshot = buildMockDataSnapshot(
      baseState,
      new Date("2026-07-06T12:00:00.000Z")
    );

    expect(snapshot.glucoseHistory).toHaveLength(30 * 24 * 12 + 1);
    expect(snapshot.glucoseHistory[0]).toMatchObject({
      source: "nightscout_trio"
    });
    expect(snapshot.glucoseHistory.at(-1)).toMatchObject({
      reading_timestamp: "2026-07-06T12:00:00.000Z"
    });
  });

  it("supports a one year CGM backfill at five minute cadence", () => {
    const snapshot = buildMockDataSnapshot(
      { ...baseState, cgmBackfillDays: MOCK_CGM_BACKFILL_MAX_DAYS },
      new Date("2026-07-06T12:00:00.000Z")
    );

    expect(snapshot.glucoseHistory).toHaveLength(
      MOCK_CGM_BACKFILL_MAX_DAYS * 24 * 12 + 1
    );
    expect(snapshot.glucoseHistory[0]).toMatchObject({
      reading_timestamp: "2025-07-06T12:00:00.000Z"
    });
  });

  it("varies glucose patterns across days without randomizing test output", () => {
    const now = new Date("2026-07-06T12:00:00.000Z");
    const first = buildMockDataSnapshot(baseState, now);
    const second = buildMockDataSnapshot(baseState, now);
    const valuesByDay = new Map<string, number[]>();

    for (const reading of first.glucoseHistory) {
      const day = reading.reading_timestamp.slice(0, 10);
      const values = valuesByDay.get(day) ?? [];
      values.push(reading.value);
      valuesByDay.set(day, values);
    }

    const completeProfiles = [...valuesByDay.values()].filter(
      (values) => values.length === 288
    );
    const uniqueProfiles = new Set(
      completeProfiles.map((values) => values.join(","))
    );
    const dailyPeaks = new Set(
      completeProfiles.map((values) => values.indexOf(Math.max(...values)))
    );

    expect(second.glucoseHistory).toEqual(first.glucoseHistory);
    expect(uniqueProfiles.size).toBeGreaterThan(20);
    expect(dailyPeaks.size).toBeGreaterThan(8);
  });

  it("includes occasional urgent excursions in a balanced baseline week", () => {
    const snapshot = buildMockDataSnapshot(
      { ...baseState, cgmBackfillDays: 7 },
      new Date("2026-07-06T12:00:00.000Z")
    );
    const values = snapshot.glucoseHistory.map((reading) => reading.value);
    const urgentLowCount = values.filter((value) => value < 55).length;
    const urgentHighCount = values.filter((value) => value > 250).length;
    const inRangeCount = values.filter(
      (value) => value >= 70 && value <= 180
    ).length;
    const highCount = values.filter((value) => value > 180).length;

    expect(Math.min(...values)).toBeLessThan(55);
    expect(urgentLowCount).toBeLessThan(24);
    expect(Math.max(...values)).toBeGreaterThan(250);
    expect(urgentHighCount).toBeLessThan(24);
    expect(inRangeCount).toBeGreaterThan(highCount);
    expect(inRangeCount / values.length).toBeGreaterThan(0.55);
  });

  it("limits glucose history responses while keeping generated backfill", () => {
    const snapshot = buildMockDataSnapshot(
      baseState,
      new Date("2026-07-06T12:00:00.000Z")
    );
    const response = buildGlucoseHistoryResponse(
      snapshot,
      new URLSearchParams("minutes=1440&limit=288")
    );

    expect(response.count).toBe(288);
    expect(response.readings[0].reading_timestamp).toBe(
      "2026-07-05T12:05:00.000Z"
    );
  });

  it("calculates glucose aggregates from the complete selected range", () => {
    const now = new Date("2026-07-06T12:00:00.000Z");
    const snapshot = buildMockDataSnapshot(baseState, now);
    const start = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const rangeParams = new URLSearchParams({
      start: start.toISOString(),
      end: now.toISOString()
    });
    const historyParams = new URLSearchParams(rangeParams);
    historyParams.set("limit", "10000");

    const history = buildGlucoseHistoryResponse(snapshot, historyParams);
    const stats = buildGlucoseStats(snapshot, rangeParams);
    const timeInRange = buildTimeInRangeDetail(snapshot, rangeParams);
    const bucketReadingCount = timeInRange.buckets.reduce(
      (total, bucket) => total + bucket.readings,
      0
    );

    expect(history.count).toBeGreaterThan(288);
    expect(stats.readings_count).toBe(history.count);
    expect(timeInRange.readings_count).toBe(history.count);
    expect(bucketReadingCount).toBe(history.count);
  });

  it("switches pump and CGM surfaces from scenario state", () => {
    const snapshot = buildMockDataSnapshot(
      baseState,
      new Date("2026-07-06T12:00:00.000Z")
    );

    expect(buildCgmSources(baseState)).toMatchObject({
      primary_source: "nightscout_trio",
      multiple_sources: true
    });
    expect(buildPumpStatus(baseState, snapshot).loop_status).toMatchObject({
      state: "looping",
      source: "trio"
    });
    expect(buildForecast(baseState, snapshot)).toMatchObject({
      effective_source: "trio",
      forecast_unavailable_reason: null
    });
  });

  it("varies manual and automated doses across realistic daily ranges", () => {
    const snapshot = buildMockDataSnapshot(
      { ...baseState, pumpSource: "tandem" },
      new Date("2026-07-06T20:00:00.000Z")
    );
    const repeatedSnapshot = buildMockDataSnapshot(
      { ...baseState, pumpSource: "tandem" },
      new Date("2026-07-06T20:00:00.000Z")
    );
    const dailyCounts = new Map<
      string,
      { manual: number; automated: number }
    >();

    for (const event of snapshot.pumpEvents) {
      if (event.event_type !== "bolus" && event.event_type !== "correction") {
        continue;
      }

      const timestamp = new Date(event.event_timestamp);
      const date = [
        timestamp.getFullYear(),
        String(timestamp.getMonth() + 1).padStart(2, "0"),
        String(timestamp.getDate()).padStart(2, "0")
      ].join("-");
      const counts = dailyCounts.get(date) ?? { manual: 0, automated: 0 };
      if (event.is_automated) {
        counts.automated += 1;
      } else {
        counts.manual += 1;
      }
      dailyCounts.set(date, counts);
    }

    const completeDays = [...dailyCounts.entries()]
      .filter(([date]) => date < "2026-07-06")
      .map(([, counts]) => counts);
    const manualCounts = completeDays.map((counts) => counts.manual);
    const automatedCounts = completeDays.map((counts) => counts.automated);
    const average = (values: number[]) =>
      values.reduce((total, value) => total + value, 0) / values.length;

    expect(repeatedSnapshot.pumpEvents).toEqual(snapshot.pumpEvents);
    expect(completeDays).toHaveLength(29);
    expect(manualCounts.every((count) => count >= 4 && count <= 16)).toBe(true);
    expect(automatedCounts.every((count) => count >= 2 && count <= 14)).toBe(
      true
    );
    expect(average(manualCounts)).toBeGreaterThanOrEqual(8);
    expect(average(manualCounts)).toBeLessThanOrEqual(12);
    expect(average(automatedCounts)).toBeGreaterThanOrEqual(6);
    expect(average(automatedCounts)).toBeLessThanOrEqual(10);
    expect(new Set(manualCounts).size).toBeGreaterThanOrEqual(8);
    expect(new Set(automatedCounts).size).toBeGreaterThanOrEqual(8);
  });

  it("varies automated basal delivery and limits suspensions", () => {
    const snapshot = buildMockDataSnapshot(
      { ...baseState, pumpSource: "tandem", cgmBackfillDays: 7 },
      new Date("2026-07-06T20:00:00.000Z")
    );
    const basalEvents = snapshot.pumpEvents.filter(
      (event) => event.event_type === "basal" && event.duration_minutes === 180
    );
    const basalRates = basalEvents.flatMap((event) =>
      event.units === null ? [] : [event.units]
    );
    const adjustmentPercentages = basalEvents.flatMap((event) =>
      event.basal_adjustment_pct === null ? [] : [event.basal_adjustment_pct]
    );
    const suspensionCount = snapshot.pumpEvents.filter(
      (event) => event.event_type === "suspend"
    ).length;

    expect(new Set(basalRates).size).toBeGreaterThan(20);
    expect(Math.max(...basalRates) - Math.min(...basalRates)).toBeGreaterThan(
      0.5
    );
    expect(adjustmentPercentages.some((value) => value < 75)).toBe(true);
    expect(adjustmentPercentages.some((value) => value > 125)).toBe(true);
    expect(suspensionCount).toBeGreaterThanOrEqual(1);
    expect(suspensionCount).toBeLessThanOrEqual(2);
  });

  it("preserves manual and automated dose metadata in bolus review", () => {
    const state = { ...baseState, pumpSource: "tandem" as const };
    const snapshot = buildMockDataSnapshot(
      state,
      new Date("2026-07-06T20:00:00.000Z")
    );
    const response = buildBolusReview(
      snapshot,
      new URLSearchParams("days=1&limit=500")
    );
    const manualDoses = response.boluses.filter(
      (event) => event.event_type === "bolus" && !event.is_automated
    );
    const automatedCorrections = response.boluses.filter(
      (event) => event.event_type === "correction" && event.is_automated
    );

    expect(manualDoses.length).toBeGreaterThan(0);
    expect(automatedCorrections.length).toBeGreaterThan(0);
    expect(
      manualDoses.every(
        (event) => event.control_iq_reason === null && event.units > 0
      )
    ).toBe(true);
    expect(
      automatedCorrections.every(
        (event) =>
          event.control_iq_reason === "auto_correction" && event.units > 0
      )
    ).toBe(true);
    expect(snapshot.pumpEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: "basal",
          pump_activity_mode: "sleep"
        }),
        expect.objectContaining({
          event_type: "basal",
          pump_activity_mode: "exercise"
        })
      ])
    );
    expect(buildPumpStatus(state, snapshot)).toMatchObject({
      basal: expect.any(Object),
      battery: expect.any(Object),
      reservoir: expect.any(Object)
    });
  });

  it("models MDI with manual rapid doses and daily long acting injections", () => {
    const state: MockRuntimeState = {
      ...baseState,
      pumpSource: "mdi",
      cgmBackfillDays: 2
    };
    const snapshot = buildMockDataSnapshot(
      state,
      new Date("2026-07-06T20:00:00.000Z")
    );
    const eventTypes = new Set(
      snapshot.pumpEvents.map((event) => event.event_type)
    );
    const basalInjections = snapshot.pumpEvents.filter(
      (event) => event.event_type === "basal_injection"
    );
    const review = buildBolusReview(
      snapshot,
      new URLSearchParams("days=2&limit=20")
    );
    const summary = buildInsulinSummary(
      snapshot,
      new URLSearchParams("days=2")
    );

    expect(eventTypes).toEqual(new Set(["bolus", "basal_injection"]));
    expect(basalInjections).toHaveLength(2);
    expect(snapshot.pumpEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: "basal_injection",
          units: 24,
          is_automated: false,
          duration_minutes: null
        })
      ])
    );
    expect(
      snapshot.pumpEvents.every(
        (event) =>
          event.is_automated === false &&
          event.pump_activity_mode === null &&
          event.control_iq_reason === null
      )
    ).toBe(true);
    expect(review.boluses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event_type: "bolus" }),
        expect.objectContaining({ event_type: "basal_injection", units: 24 })
      ])
    );
    expect(summary).toMatchObject({
      basal_units: 0,
      basal_injection_units: 24,
      basal_injection_count: 2,
      correction_units: 0,
      correction_count: 0
    });
    expect(summary.tdd).toBeGreaterThan(summary.basal_injection_units ?? 0);
    expect(summary.basal_pct).toBeGreaterThan(0);
    expect(buildPumpStatus(state, snapshot)).toEqual({
      basal: null,
      battery: null,
      reservoir: null,
      loop_status: null,
      override: null,
      cob_grams: null
    });
    expect(buildForecast(state, snapshot)).toMatchObject({
      effective_source: null,
      available_sources: [],
      forecast: null,
      forecast_unavailable_reason: "no_sources"
    });
  });

  it("keeps No pump as CGM only", () => {
    const state: MockRuntimeState = {
      ...baseState,
      pumpSource: "none",
      cgmBackfillDays: 2
    };
    const snapshot = buildMockDataSnapshot(
      state,
      new Date("2026-07-06T20:00:00.000Z")
    );

    expect(snapshot.pumpEvents).toEqual([]);
    expect(
      buildBolusReview(snapshot, new URLSearchParams("days=2&limit=20"))
    ).toMatchObject({ boluses: [], total_count: 0 });
    expect(
      buildInsulinSummary(snapshot, new URLSearchParams("days=2"))
    ).toMatchObject({
      tdd: 0,
      basal_units: 0,
      basal_injection_units: 0,
      basal_injection_count: 0,
      bolus_units: 0,
      correction_units: 0,
      bolus_count: 0,
      correction_count: 0
    });
    expect(buildPumpStatus(state, snapshot)).toMatchObject({
      basal: null,
      battery: null,
      reservoir: null,
      loop_status: null
    });
  });

  it("can trigger urgent low and urgent high glucose readings", () => {
    const now = new Date("2026-07-06T12:00:00.000Z");
    const urgentLow = buildMockDataSnapshot(
      { ...baseState, glucoseEvent: "urgent-low" },
      now
    );
    const urgentHigh = buildMockDataSnapshot(
      { ...baseState, glucoseEvent: "urgent-high" },
      now
    );

    expect(urgentLow.glucoseHistory.at(-1)).toMatchObject({
      value: 48,
      trend: expect.stringMatching(/down/)
    });
    expect(urgentHigh.glucoseHistory.at(-1)).toMatchObject({
      value: 285,
      trend: expect.stringMatching(/up/)
    });
    expect(buildActiveAlerts(urgentLow).alerts[0]).toMatchObject({
      alert_type: "low_glucose",
      severity: "urgent"
    });
    expect(buildActiveAlerts(urgentHigh).alerts[0]).toMatchObject({
      alert_type: "high_glucose",
      severity: "urgent"
    });
  });

  it("builds daily brief insights from mock data", () => {
    const snapshot = buildMockDataSnapshot(
      baseState,
      new Date("2026-07-06T12:00:00.000Z")
    );
    const response = buildMockInsights(
      baseState,
      snapshot,
      new URLSearchParams("limit=50")
    );

    expect(response.total).toBeGreaterThan(0);
    expect(response.insights[0]).toMatchObject({
      analysis_type: "daily_brief",
      status: "pending"
    });

    const detail = buildMockInsightDetail(
      baseState,
      snapshot,
      response.insights[0].id
    );
    expect(detail).toMatchObject({
      analysis_type: "daily_brief",
      model_info: {
        provider: "msw"
      },
      safety: {
        status: "safe"
      }
    });
  });

  it("stores generated daily briefs ahead of seeded briefs", () => {
    const snapshot = buildMockDataSnapshot(
      baseState,
      new Date("2026-07-06T12:00:00.000Z")
    );
    const generated = generateAndStoreMockDailyBrief(baseState, snapshot, 24);
    const response = buildMockInsights(
      baseState,
      snapshot,
      new URLSearchParams("limit=50")
    );

    expect(response.insights[0]).toMatchObject({
      id: generated.id,
      analysis_type: "daily_brief"
    });
    expect(buildMockUnreadInsightCount(baseState, snapshot).unread_count).toBe(
      1
    );
  });
});
