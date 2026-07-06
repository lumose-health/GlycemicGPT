import {
  buildActiveAlerts,
  buildCgmSources,
  buildForecast,
  buildGlucoseHistoryResponse,
  buildMockInsightDetail,
  buildMockInsights,
  buildMockUnreadInsightCount,
  buildMockDataSnapshot,
  buildPumpStatus,
  generateAndStoreMockDailyBrief,
} from "./data";
import {
  MOCK_CGM_BACKFILL_MAX_DAYS,
  type MockRuntimeState,
} from "./types";

const baseState: MockRuntimeState = {
  enabled: true,
  cgmSource: "nightscout-trio",
  pumpSource: "trio-nightscout",
  cgmBackfillDays: 30,
  liveMode: true,
  glucoseEvent: "baseline",
  updatedAt: "2026-07-06T12:00:00.000Z",
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
      source: "nightscout_trio",
    });
    expect(snapshot.glucoseHistory.at(-1)).toMatchObject({
      reading_timestamp: "2026-07-06T12:00:00.000Z",
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
      reading_timestamp: "2025-07-06T12:00:00.000Z",
    });
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

  it("switches pump and CGM surfaces from scenario state", () => {
    const snapshot = buildMockDataSnapshot(
      baseState,
      new Date("2026-07-06T12:00:00.000Z")
    );

    expect(buildCgmSources(baseState)).toMatchObject({
      primary_source: "nightscout_trio",
      multiple_sources: true,
    });
    expect(buildPumpStatus(baseState, snapshot).loop_status).toMatchObject({
      state: "looping",
      source: "trio",
    });
    expect(buildForecast(baseState, snapshot)).toMatchObject({
      effective_source: "trio",
      forecast_unavailable_reason: null,
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
      trend: expect.stringMatching(/down/),
    });
    expect(urgentHigh.glucoseHistory.at(-1)).toMatchObject({
      value: 285,
      trend: expect.stringMatching(/up/),
    });
    expect(buildActiveAlerts(urgentLow).alerts[0]).toMatchObject({
      alert_type: "low_glucose",
      severity: "urgent",
    });
    expect(buildActiveAlerts(urgentHigh).alerts[0]).toMatchObject({
      alert_type: "high_glucose",
      severity: "urgent",
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
      status: "pending",
    });

    const detail = buildMockInsightDetail(
      baseState,
      snapshot,
      response.insights[0].id
    );
    expect(detail).toMatchObject({
      analysis_type: "daily_brief",
      model_info: {
        provider: "msw",
      },
      safety: {
        status: "safe",
      },
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
      analysis_type: "daily_brief",
    });
    expect(buildMockUnreadInsightCount(baseState, snapshot).unread_count).toBe(
      1
    );
  });
});
