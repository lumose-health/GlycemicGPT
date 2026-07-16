import type { BolusReviewItem, PumpEventReading } from "@/lib/api";
import {
  DEFAULT_PUMP_EVENT_DURATION_MS,
  derivePumpActivityIntervals,
  derivePumpSuspensionIntervals,
  layoutPumpActivityLanes,
  normalizeInsulinDoseTimeline,
  normalizePumpBasalSegments,
  normalizePumpTimeline,
  resolveRapidDoseDomain,
  type RapidInsulinDose,
} from "./insulin-timeline-data";

function at(hour: number, minute = 0): string {
  return new Date(Date.UTC(2026, 6, 12, hour, minute)).toISOString();
}

function msAt(hour: number, minute = 0): number {
  return new Date(at(hour, minute)).getTime();
}

function bolusReviewItem(
  overrides: Partial<BolusReviewItem> = {}
): BolusReviewItem {
  return {
    event_timestamp: at(8),
    event_type: "bolus",
    units: 3,
    is_automated: false,
    control_iq_reason: null,
    pump_activity_mode: null,
    iob_at_event: null,
    bg_at_event: null,
    ...overrides,
  };
}

function pumpEvent(
  eventType: PumpEventReading["event_type"],
  hour: number,
  overrides: Partial<PumpEventReading> = {},
  minute = 0
): PumpEventReading {
  return {
    event_type: eventType,
    event_timestamp: at(hour, minute),
    units: eventType === "basal" ? 0.8 : null,
    duration_minutes: null,
    is_automated: false,
    control_iq_reason: null,
    pump_activity_mode: null,
    basal_adjustment_pct: null,
    iob_at_event: null,
    cob_at_event: null,
    bg_at_event: null,
    received_at: at(hour, minute),
    source: "tandem",
    ...overrides,
  };
}

describe("normalizeInsulinDoseTimeline", () => {
  it("separates manual boluses, automated corrections, and basal injections", () => {
    const result = normalizeInsulinDoseTimeline([
      bolusReviewItem({
        event_timestamp: at(10),
        units: 4,
        iob_at_event: 1.4,
        bg_at_event: 155,
      }),
      bolusReviewItem({
        event_timestamp: at(9),
        event_type: "correction",
        units: 1.2,
        is_automated: false,
        control_iq_reason: "predicted_high",
        pump_activity_mode: "sleep",
      }),
      bolusReviewItem({
        event_timestamp: at(11),
        event_type: "basal_injection",
        units: 24,
      }),
    ]);

    expect(result.rapidDoses).toEqual([
      expect.objectContaining({
        timestampMs: msAt(9),
        deliveredUnits: 1.2,
        kind: "automated_correction",
        isAutomated: true,
        controlIqReason: "predicted_high",
        pumpActivityMode: "sleep",
      }),
      expect.objectContaining({
        timestampMs: msAt(10),
        deliveredUnits: 4,
        kind: "manual_bolus",
        isAutomated: false,
        insulinOnBoardUnits: 1.4,
        glucoseAtEventMgDl: 155,
      }),
    ]);
    expect(result.longActingBasalInjections).toEqual([
      expect.objectContaining({
        timestampMs: msAt(11),
        injectedUnits: 24,
        kind: "long_acting_basal_injection",
      }),
    ]);
  });

  it("uses automation metadata without inventing a manual correction category", () => {
    const result = normalizeInsulinDoseTimeline([
      bolusReviewItem({
        event_type: "bolus",
        is_automated: true,
      }),
      bolusReviewItem({
        event_timestamp: at(9),
        event_type: undefined,
        is_automated: false,
      }),
    ]);

    expect(result.rapidDoses.map((dose) => dose.kind)).toEqual([
      "automated_correction",
      "manual_bolus",
    ]);
  });

  it("deduplicates equivalent rows and rejects invalid timestamps and units", () => {
    const validRapid = bolusReviewItem({ units: 5 });
    const validBasal = bolusReviewItem({
      event_timestamp: at(9),
      event_type: "basal_injection",
      units: 32,
    });

    const result = normalizeInsulinDoseTimeline([
      validRapid,
      { ...validRapid },
      validBasal,
      { ...validBasal },
      bolusReviewItem({ event_timestamp: "not a timestamp" }),
      bolusReviewItem({ event_timestamp: at(10), units: 0 }),
      bolusReviewItem({ event_timestamp: at(11), units: Number.NaN }),
      bolusReviewItem({ event_timestamp: at(12), units: 61 }),
      bolusReviewItem({
        event_timestamp: at(13),
        event_type: "basal_injection",
        units: 161,
      }),
    ]);

    expect(result.rapidDoses).toHaveLength(1);
    expect(result.longActingBasalInjections).toHaveLength(1);
  });
});

describe("resolveRapidDoseDomain", () => {
  function rapidDose(timestampMs: number, deliveredUnits: number): RapidInsulinDose {
    return {
      timestampMs,
      deliveredUnits,
      kind: "manual_bolus",
      isAutomated: false,
      controlIqReason: null,
      pumpActivityMode: null,
      insulinOnBoardUnits: null,
      glucoseAtEventMgDl: null,
    };
  }

  it("keeps a minimum five unit maximum", () => {
    expect(resolveRapidDoseDomain([])).toEqual([0, 5]);
    expect(resolveRapidDoseDomain([rapidDose(msAt(8), 2.5)])).toEqual([0, 5]);
  });

  it("uses the largest dose in the visible range", () => {
    const doses = [
      rapidDose(msAt(8), 12),
      rapidDose(msAt(9), 3),
      rapidDose(msAt(10), 7.5),
    ];

    expect(
      resolveRapidDoseDomain(doses, {
        startMs: msAt(9),
        endMs: msAt(10),
      })
    ).toEqual([0, 7.5]);
  });
});

describe("normalizePumpBasalSegments", () => {
  it("uses recorded duration and cuts it at the next pump state event", () => {
    const segments = normalizePumpBasalSegments([
      pumpEvent("basal", 0, { units: 0.9, duration_minutes: 180 }),
      pumpEvent("bolus", 0, { units: 4 }, 30),
      pumpEvent("basal", 1, { units: 1.1, duration_minutes: 30 }),
    ]);

    expect(segments).toEqual([
      expect.objectContaining({
        startMs: msAt(0),
        endMs: msAt(1),
        rateUnitsPerHour: 0.9,
      }),
      expect.objectContaining({
        startMs: msAt(1),
        endMs: msAt(1, 30),
        rateUnitsPerHour: 1.1,
      }),
    ]);
  });

  it("limits events without valid duration to two hours and leaves gaps", () => {
    const segments = normalizePumpBasalSegments([
      pumpEvent("basal", 0, { units: 0.9 }),
      pumpEvent("basal", 3, { units: 1.1, duration_minutes: -10 }),
    ]);

    expect(segments[0]).toEqual(
      expect.objectContaining({
        startMs: msAt(0),
        endMs: msAt(0) + DEFAULT_PUMP_EVENT_DURATION_MS,
      })
    );
    expect(segments[1]).toEqual(
      expect.objectContaining({
        startMs: msAt(3),
        endMs: msAt(3) + DEFAULT_PUMP_EVENT_DURATION_MS,
      })
    );
  });

  it("renders suspension at zero and leaves a gap after resume", () => {
    const segments = normalizePumpBasalSegments([
      pumpEvent("basal", 0, { units: 0.8, duration_minutes: 180 }),
      pumpEvent("suspend", 0, { pump_activity_mode: "sleep" }, 30),
      pumpEvent("resume", 1),
      pumpEvent("basal", 1, { units: 0.7, duration_minutes: 30 }, 30),
    ]);

    expect(segments).toEqual([
      expect.objectContaining({
        startMs: msAt(0),
        endMs: msAt(0, 30),
        rateUnitsPerHour: 0.8,
        deliveryState: "delivering",
      }),
      expect.objectContaining({
        startMs: msAt(0, 30),
        endMs: msAt(1),
        rateUnitsPerHour: 0,
        deliveryState: "suspended",
        pumpActivityMode: "sleep",
      }),
      expect.objectContaining({
        startMs: msAt(1, 30),
        endMs: msAt(2),
        rateUnitsPerHour: 0.7,
      }),
    ]);
  });

  it("merges only contiguous segments with identical rate and hover metadata", () => {
    const segments = normalizePumpBasalSegments([
      pumpEvent("basal", 0, {
        units: 0.8,
        duration_minutes: 60,
        is_automated: true,
        pump_activity_mode: "sleep",
      }),
      pumpEvent("basal", 1, {
        units: 0.8,
        duration_minutes: 60,
        is_automated: true,
        pump_activity_mode: "sleep",
      }),
      pumpEvent("basal", 2, {
        units: 0.8,
        duration_minutes: 60,
        is_automated: false,
        pump_activity_mode: "sleep",
      }),
    ]);

    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual(
      expect.objectContaining({ startMs: msAt(0), endMs: msAt(2) })
    );
    expect(segments[1]).toEqual(
      expect.objectContaining({ startMs: msAt(2), endMs: msAt(3) })
    );
  });

  it("treats an invalid basal row as a boundary without inventing delivery", () => {
    const segments = normalizePumpBasalSegments([
      pumpEvent("basal", 0, { units: 0.8, duration_minutes: 180 }),
      pumpEvent("basal", 1, { units: Number.NaN }),
      pumpEvent("basal", 2, { units: 0.9, duration_minutes: 30 }),
    ]);

    expect(segments).toEqual([
      expect.objectContaining({ startMs: msAt(0), endMs: msAt(1) }),
      expect.objectContaining({ startMs: msAt(2), endMs: msAt(2, 30) }),
    ]);
  });
});

describe("derivePumpActivityIntervals", () => {
  it("derives and merges sleep and exercise intervals independently of basal", () => {
    const intervals = derivePumpActivityIntervals([
      pumpEvent("basal", 0, {
        duration_minutes: 60,
        is_automated: true,
        pump_activity_mode: "Sleep",
      }),
      pumpEvent("resume", 1, {
        duration_minutes: 60,
        is_automated: true,
        pump_activity_mode: "sleep",
      }),
      pumpEvent("suspend", 2, {
        duration_minutes: 30,
        is_automated: true,
        pump_activity_mode: "activity",
      }),
      pumpEvent("basal", 2, {
        duration_minutes: 60,
        pump_activity_mode: "normal",
      }, 30),
    ]);

    expect(intervals).toEqual([
      {
        startMs: msAt(0),
        endMs: msAt(2),
        mode: "sleep",
        isAutomated: true,
        source: "tandem",
      },
      {
        startMs: msAt(2),
        endMs: msAt(2, 30),
        mode: "exercise",
        isAutomated: true,
        source: "tandem",
      },
    ]);
  });

  it("returns all pump tracks from the combined normalizer", () => {
    const timeline = normalizePumpTimeline([
      pumpEvent("basal", 8, {
        units: 0.75,
        duration_minutes: 60,
        pump_activity_mode: "exercise",
      }),
    ]);

    expect(timeline.basalSegments).toHaveLength(1);
    expect(timeline.activityIntervals).toHaveLength(1);
    expect(timeline.suspensionIntervals).toHaveLength(0);
  });
});

describe("derivePumpSuspensionIntervals", () => {
  it("keeps explicit Resume when a Basal row shares its timestamp", () => {
    const intervals = derivePumpSuspensionIntervals([
      pumpEvent("suspend", 10, { is_automated: true }),
      pumpEvent("resume", 10, {}, 30),
      pumpEvent("basal", 10, { units: 0.7 }, 30),
    ]);

    expect(intervals).toEqual([
      {
        startMs: msAt(10),
        endMs: msAt(10, 30),
        hasConfirmedResume: true,
        isAutomated: true,
        source: "tandem",
      },
    ]);
  });

  it("uses a reported duration when no later delivery event exists", () => {
    expect(
      derivePumpSuspensionIntervals([
        pumpEvent("suspend", 10, { duration_minutes: 45 }),
      ])
    ).toEqual([
      expect.objectContaining({
        startMs: msAt(10),
        endMs: msAt(10, 45),
        hasConfirmedResume: false,
      }),
    ]);
  });
});

describe("layoutPumpActivityLanes", () => {
  it("keeps non-overlapping activity on the first lane", () => {
    const layout = layoutPumpActivityLanes(
      [
        {
          startMs: msAt(8),
          endMs: msAt(9),
          mode: "sleep",
          isAutomated: true,
          source: "tandem",
        },
      ],
      [
        {
          startMs: msAt(10),
          endMs: msAt(10, 30),
          hasConfirmedResume: true,
          isAutomated: true,
          source: "tandem",
        },
      ]
    );

    expect(layout.map((interval) => interval.lane)).toEqual([0, 0]);
  });

  it("moves only colliding activity to the next lane", () => {
    const layout = layoutPumpActivityLanes(
      [
        {
          startMs: msAt(8),
          endMs: msAt(10),
          mode: "sleep",
          isAutomated: true,
          source: "tandem",
        },
      ],
      [
        {
          startMs: msAt(9),
          endMs: msAt(9, 30),
          hasConfirmedResume: true,
          isAutomated: true,
          source: "tandem",
        },
      ]
    );

    expect(layout).toEqual([
      expect.objectContaining({ kind: "sleep", lane: 0 }),
      expect.objectContaining({ kind: "suspension", lane: 1 }),
    ]);
  });
});
