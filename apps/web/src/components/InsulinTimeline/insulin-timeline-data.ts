import type { BolusReviewItem, PumpEventReading } from "@/lib/api";

export const MIN_RAPID_DOSE_DOMAIN_UNITS = 5;
export const MAX_RAPID_DOSE_UNITS = 60;
export const MAX_LONG_ACTING_BASAL_INJECTION_UNITS = 160;
export const DEFAULT_PUMP_EVENT_DURATION_MS = 2 * 60 * 60 * 1000;

export type RapidInsulinDoseKind =
  | "manual_bolus"
  | "automated_correction";

export interface RapidInsulinDose {
  timestampMs: number;
  deliveredUnits: number;
  kind: RapidInsulinDoseKind;
  isAutomated: boolean;
  controlIqReason: string | null;
  pumpActivityMode: string | null;
  insulinOnBoardUnits: number | null;
  glucoseAtEventMgDl: number | null;
}

export interface LongActingBasalInjection {
  timestampMs: number;
  injectedUnits: number;
  kind: "long_acting_basal_injection";
  isAutomated: boolean;
  controlIqReason: string | null;
  pumpActivityMode: string | null;
  insulinOnBoardUnits: number | null;
  glucoseAtEventMgDl: number | null;
}

export interface InsulinDoseTimelineData {
  rapidDoses: RapidInsulinDose[];
  longActingBasalInjections: LongActingBasalInjection[];
}

export interface InsulinOnBoardSample {
  timestampMs: number;
  valueUnits: number;
  source: string;
}

export interface TimelineVisibleRange {
  startMs: number;
  endMs: number;
}

export type PumpActivityMode = "sleep" | "exercise";
export type PumpBasalDeliveryState = "delivering" | "suspended";

export interface PumpBasalSegment {
  startMs: number;
  endMs: number;
  rateUnitsPerHour: number;
  deliveryState: PumpBasalDeliveryState;
  isAutomated: boolean;
  controlIqReason: string | null;
  pumpActivityMode: PumpActivityMode | null;
  basalAdjustmentPercent: number | null;
  source: string;
}

export interface PumpActivityInterval {
  startMs: number;
  endMs: number;
  mode: PumpActivityMode;
  isAutomated: boolean;
  source: string;
}

export interface PumpSuspensionInterval {
  startMs: number;
  endMs: number;
  hasConfirmedResume: boolean;
  isAutomated: boolean;
  source: string;
}

export interface PumpActivityLaneInterval {
  startMs: number;
  endMs: number;
  kind: PumpActivityMode | "suspension";
  lane: number;
  hasConfirmedResume: boolean;
}

export interface PumpTimelineData {
  basalSegments: PumpBasalSegment[];
  activityIntervals: PumpActivityInterval[];
  suspensionIntervals: PumpSuspensionInterval[];
}

type RelevantPumpEventType = "basal" | "suspend" | "resume";

interface RelevantPumpEvent {
  event: PumpEventReading;
  eventType: RelevantPumpEventType;
  timestampMs: number;
}

function toFiniteNumber(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseTimestamp(timestamp: string): number | null {
  const parsed = new Date(timestamp).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeActivityMode(mode: string | null): PumpActivityMode | null {
  const normalized = mode?.trim().toLowerCase();

  if (normalized === "sleep") {
    return "sleep";
  }

  if (normalized === "exercise" || normalized === "activity") {
    return "exercise";
  }

  return null;
}

// `BolusReviewItem.event_type` is a free-form string on the wire (default
// `"bolus"`), not an enum -- see the comment on the type in lib/api.ts. This
// is the full set of values the review endpoint is documented to emit. A
// value outside this set must never fall through to a known insulin-delivery
// kind (GLY-180 safety requirement); every classification site in this file,
// InsulinTimeline.tsx, and the bolus review tables runs a row through
// `isKnownBolusReviewEventType` first and skips it instead of guessing.
// Pinning this allowlist to the backend via a `Literal` is filed as GLY-241.
export type KnownBolusReviewEventType =
  (typeof KNOWN_BOLUS_REVIEW_EVENT_TYPES_LIST)[number];

const KNOWN_BOLUS_REVIEW_EVENT_TYPES_LIST = [
  "bolus",
  "correction",
  "basal_injection",
] as const;

const KNOWN_BOLUS_REVIEW_EVENT_TYPES: ReadonlySet<string> = new Set(
  KNOWN_BOLUS_REVIEW_EVENT_TYPES_LIST
);

export function isKnownBolusReviewEventType(
  eventType: BolusReviewItem["event_type"]
): eventType is KnownBolusReviewEventType {
  return KNOWN_BOLUS_REVIEW_EVENT_TYPES.has(eventType);
}

/** Warns (dev-visible; Sentry picks up console breadcrumbs where configured)
 * whenever a row is skipped for carrying an unrecognized `event_type`, so the
 * skip is observable instead of silent. */
export function warnUnknownBolusReviewEventType(
  eventType: BolusReviewItem["event_type"],
  source: string
): void {
  console.warn(
    `[${source}] skipping BolusReviewItem with unrecognized event_type: ${JSON.stringify(eventType)}`
  );
}

function doseKind(item: BolusReviewItem): RapidInsulinDoseKind {
  return item.event_type === "correction" || item.is_automated
    ? "automated_correction"
    : "manual_bolus";
}

/**
 * Converts bolus review rows into the two medically distinct injected-insulin
 * tracks. A manual correction is intentionally not inferred from glucose data:
 * the API stores manual rapid-acting insulin as a bolus and automated insulin
 * as a correction.
 */
export function normalizeInsulinDoseTimeline(
  items: readonly BolusReviewItem[]
): InsulinDoseTimelineData {
  const rapidDoses: RapidInsulinDose[] = [];
  const longActingBasalInjections: LongActingBasalInjection[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const timestampMs = parseTimestamp(item.event_timestamp);
    const units = toFiniteNumber(item.units);

    if (timestampMs === null || units === null || units <= 0) {
      continue;
    }

    if (!isKnownBolusReviewEventType(item.event_type)) {
      warnUnknownBolusReviewEventType(
        item.event_type,
        "normalizeInsulinDoseTimeline"
      );
      continue;
    }

    const commonMetadata = {
      timestampMs,
      controlIqReason: item.control_iq_reason,
      pumpActivityMode: item.pump_activity_mode,
      insulinOnBoardUnits: toFiniteNumber(item.iob_at_event),
      glucoseAtEventMgDl: toFiniteNumber(item.bg_at_event),
    };

    if (item.event_type === "basal_injection") {
      if (units > MAX_LONG_ACTING_BASAL_INJECTION_UNITS) {
        continue;
      }

      const dedupeKey = `long_acting_basal_injection:${timestampMs}:${units}`;
      if (seen.has(dedupeKey)) {
        continue;
      }

      seen.add(dedupeKey);
      longActingBasalInjections.push({
        ...commonMetadata,
        injectedUnits: units,
        kind: "long_acting_basal_injection",
        isAutomated: item.is_automated,
      });
      continue;
    }

    if (units > MAX_RAPID_DOSE_UNITS) {
      continue;
    }

    const kind = doseKind(item);
    const dedupeKey = `${kind}:${timestampMs}:${units}`;
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    rapidDoses.push({
      ...commonMetadata,
      deliveredUnits: units,
      kind,
      isAutomated: kind === "automated_correction",
    });
  }

  rapidDoses.sort((left, right) => left.timestampMs - right.timestampMs);
  longActingBasalInjections.sort(
    (left, right) => left.timestampMs - right.timestampMs
  );

  return { rapidDoses, longActingBasalInjections };
}

/**
 * Extracts the IoB values reported alongside pump history events. The API does
 * not currently expose a continuous historical IoB series, so these remain
 * event samples rather than inferred values between events.
 */
export function normalizeInsulinOnBoardTimeline(
  events: readonly PumpEventReading[]
): InsulinOnBoardSample[] {
  const byTimestamp = new Map<
    number,
    { receivedAtMs: number; sample: InsulinOnBoardSample }
  >();

  for (const event of events) {
    const timestampMs = parseTimestamp(event.event_timestamp);
    const valueUnits = toFiniteNumber(event.iob_at_event);

    if (timestampMs === null || valueUnits === null || valueUnits < 0) {
      continue;
    }

    const receivedAtMs = parseTimestamp(event.received_at) ?? timestampMs;
    const current = byTimestamp.get(timestampMs);

    if (current === undefined || receivedAtMs >= current.receivedAtMs) {
      byTimestamp.set(timestampMs, {
        receivedAtMs,
        sample: {
          timestampMs,
          valueUnits,
          source: event.source,
        },
      });
    }
  }

  return [...byTimestamp.values()]
    .map(({ sample }) => sample)
    .sort((left, right) => left.timestampMs - right.timestampMs);
}

/**
 * Resolves the rapid-insulin U axis for the currently visible time range.
 * Long-acting injections deliberately use their own value markers and are not
 * part of this scale.
 */
export function resolveRapidDoseDomain(
  doses: readonly RapidInsulinDose[],
  visibleRange?: TimelineVisibleRange
): [number, number] {
  const hasValidRange =
    visibleRange !== undefined &&
    Number.isFinite(visibleRange.startMs) &&
    Number.isFinite(visibleRange.endMs) &&
    visibleRange.startMs <= visibleRange.endMs;

  let maximumUnits = MIN_RAPID_DOSE_DOMAIN_UNITS;

  for (const dose of doses) {
    if (
      !Number.isFinite(dose.deliveredUnits) ||
      dose.deliveredUnits <= 0 ||
      (hasValidRange &&
        (dose.timestampMs < visibleRange.startMs ||
          dose.timestampMs > visibleRange.endMs))
    ) {
      continue;
    }

    maximumUnits = Math.max(maximumUnits, dose.deliveredUnits);
  }

  return [0, maximumUnits];
}

function isRelevantPumpEventType(
  eventType: PumpEventReading["event_type"]
): eventType is RelevantPumpEventType {
  return (
    eventType === "basal" ||
    eventType === "suspend" ||
    eventType === "resume"
  );
}

function pumpEventPriority(event: RelevantPumpEvent): number {
  if (event.eventType === "suspend") {
    return 3;
  }

  if (event.eventType === "basal") {
    return 2;
  }

  return 1;
}

function receivedAtMs(event: RelevantPumpEvent): number {
  return parseTimestamp(event.event.received_at) ?? Number.NEGATIVE_INFINITY;
}

/**
 * Returns one deterministic state change per timestamp. A suspend wins over a
 * simultaneous basal row because displaying zero delivery is the conservative
 * interpretation. Otherwise, the most recently received row wins.
 */
function relevantPumpEvents(
  events: readonly PumpEventReading[]
): RelevantPumpEvent[] {
  const byTimestamp = new Map<number, RelevantPumpEvent>();

  for (const event of events) {
    if (!isRelevantPumpEventType(event.event_type)) {
      continue;
    }

    const timestampMs = parseTimestamp(event.event_timestamp);
    if (timestampMs === null) {
      continue;
    }

    const candidate: RelevantPumpEvent = {
      event,
      eventType: event.event_type,
      timestampMs,
    };
    const current = byTimestamp.get(timestampMs);

    if (
      current === undefined ||
      pumpEventPriority(candidate) > pumpEventPriority(current) ||
      (pumpEventPriority(candidate) === pumpEventPriority(current) &&
        receivedAtMs(candidate) > receivedAtMs(current))
    ) {
      byTimestamp.set(timestampMs, candidate);
    }
  }

  return [...byTimestamp.values()].sort(
    (left, right) => left.timestampMs - right.timestampMs
  );
}

function eventEndMs(
  event: RelevantPumpEvent,
  nextEvent: RelevantPumpEvent | undefined
): number {
  const durationMinutes = toFiniteNumber(event.event.duration_minutes);
  const reportedDurationMs =
    durationMinutes !== null && durationMinutes > 0
      ? durationMinutes * 60 * 1000
      : null;
  const durationMs =
    reportedDurationMs !== null && Number.isFinite(reportedDurationMs)
      ? reportedDurationMs
      : DEFAULT_PUMP_EVENT_DURATION_MS;
  const durationEndMs = event.timestampMs + durationMs;

  return Math.min(
    Number.isFinite(durationEndMs)
      ? durationEndMs
      : event.timestampMs + DEFAULT_PUMP_EVENT_DURATION_MS,
    nextEvent?.timestampMs ?? Number.POSITIVE_INFINITY
  );
}

function segmentMetadata(event: RelevantPumpEvent) {
  return {
    isAutomated: event.event.is_automated,
    controlIqReason: event.event.control_iq_reason,
    pumpActivityMode: normalizeActivityMode(event.event.pump_activity_mode),
    basalAdjustmentPercent: toFiniteNumber(event.event.basal_adjustment_pct),
    source: event.event.source,
  };
}

function sameBasalState(
  left: PumpBasalSegment,
  right: PumpBasalSegment
): boolean {
  return (
    left.endMs === right.startMs &&
    left.rateUnitsPerHour === right.rateUnitsPerHour &&
    left.deliveryState === right.deliveryState &&
    left.isAutomated === right.isAutomated &&
    left.controlIqReason === right.controlIqReason &&
    left.pumpActivityMode === right.pumpActivityMode &&
    left.basalAdjustmentPercent === right.basalAdjustmentPercent &&
    left.source === right.source
  );
}

/**
 * Builds confirmed pump basal delivery intervals. Resume events close the
 * previous interval but intentionally create no new delivery interval. This
 * leaves a visible gap until a new basal rate is reported.
 */
export function normalizePumpBasalSegments(
  events: readonly PumpEventReading[]
): PumpBasalSegment[] {
  const relevantEvents = relevantPumpEvents(events);
  const segments: PumpBasalSegment[] = [];

  for (let index = 0; index < relevantEvents.length; index += 1) {
    const event = relevantEvents[index];
    const endMs = eventEndMs(event, relevantEvents[index + 1]);

    if (endMs <= event.timestampMs || event.eventType === "resume") {
      continue;
    }

    const reportedRate = toFiniteNumber(event.event.units);
    if (
      event.eventType === "basal" &&
      (reportedRate === null || reportedRate < 0)
    ) {
      continue;
    }

    const isSuspended =
      event.eventType === "suspend" ||
      (event.eventType === "basal" && reportedRate === 0);

    const segment: PumpBasalSegment = {
      startMs: event.timestampMs,
      endMs,
      rateUnitsPerHour: isSuspended ? 0 : reportedRate!,
      deliveryState: isSuspended ? "suspended" : "delivering",
      ...segmentMetadata(event),
    };
    const previous = segments[segments.length - 1];

    if (previous !== undefined && sameBasalState(previous, segment)) {
      previous.endMs = segment.endMs;
    } else {
      segments.push(segment);
    }
  }

  return segments;
}

function sameActivityState(
  left: PumpActivityInterval,
  right: PumpActivityInterval
): boolean {
  return (
    left.endMs === right.startMs &&
    left.mode === right.mode &&
    left.source === right.source
  );
}

/**
 * Derives the separate Sleep and Exercise mode bar from pump state events.
 * Normal and unknown modes are boundaries, but do not create visible regions.
 */
export function derivePumpActivityIntervals(
  events: readonly PumpEventReading[]
): PumpActivityInterval[] {
  const relevantEvents = relevantPumpEvents(events);
  const intervals: PumpActivityInterval[] = [];

  for (let index = 0; index < relevantEvents.length; index += 1) {
    const event = relevantEvents[index];
    const mode = normalizeActivityMode(event.event.pump_activity_mode);
    const endMs = eventEndMs(event, relevantEvents[index + 1]);

    if (mode === null || endMs <= event.timestampMs) {
      continue;
    }

    const interval: PumpActivityInterval = {
      startMs: event.timestampMs,
      endMs,
      mode,
      isAutomated: event.event.is_automated,
      source: event.event.source,
    };
    const previous = intervals[intervals.length - 1];

    if (previous !== undefined && sameActivityState(previous, interval)) {
      previous.endMs = interval.endMs;
    } else {
      intervals.push(interval);
    }
  }

  return intervals;
}

/**
 * Builds suspension intervals without collapsing same-time Resume and Basal
 * events. Some devices emit both when delivery restarts, and the explicit
 * Resume boundary must remain visible even when the Basal row wins state
 * normalization for the rate track.
 */
export function derivePumpSuspensionIntervals(
  events: readonly PumpEventReading[]
): PumpSuspensionInterval[] {
  const relevantEvents = events
    .filter((event) => isRelevantPumpEventType(event.event_type))
    .map((event) => ({
      event,
      eventType: event.event_type as RelevantPumpEventType,
      timestampMs: parseTimestamp(event.event_timestamp),
    }))
    .filter(
      (event): event is RelevantPumpEvent => event.timestampMs !== null
    )
    .sort((left, right) => left.timestampMs - right.timestampMs);
  const intervals: PumpSuspensionInterval[] = [];

  for (const event of relevantEvents) {
    if (event.eventType !== "suspend") {
      continue;
    }

    const nextTimestamp = relevantEvents.reduce<number | null>(
      (current, candidate) => {
        if (candidate.timestampMs <= event.timestampMs) {
          return current;
        }
        const candidateRate = toFiniteNumber(candidate.event.units);
        const resumesDelivery =
          candidate.eventType === "resume" ||
          (candidate.eventType === "basal" &&
            candidateRate !== null &&
            candidateRate > 0);
        if (!resumesDelivery) {
          return current;
        }
        return current === null
          ? candidate.timestampMs
          : Math.min(current, candidate.timestampMs);
      },
      null
    );
    const durationMinutes = toFiniteNumber(event.event.duration_minutes);
    const fallbackEndMs = event.timestampMs +
      (durationMinutes !== null && durationMinutes > 0
        ? durationMinutes * 60 * 1000
        : DEFAULT_PUMP_EVENT_DURATION_MS);
    const endMs = nextTimestamp ?? fallbackEndMs;

    if (!Number.isFinite(endMs) || endMs <= event.timestampMs) {
      continue;
    }

    intervals.push({
      startMs: event.timestampMs,
      endMs,
      hasConfirmedResume:
        nextTimestamp !== null && relevantEvents.some(
          (candidate) =>
            candidate.timestampMs === nextTimestamp &&
            (candidate.eventType === "resume" ||
              (candidate.eventType === "basal" &&
                (toFiniteNumber(candidate.event.units) ?? 0) > 0))
        ),
      isAutomated: event.event.is_automated,
      source: event.event.source,
    });
  }

  return intervals;
}

/** Places every pump activity interval in the first non-overlapping lane. */
export function layoutPumpActivityLanes(
  activityIntervals: readonly PumpActivityInterval[],
  suspensionIntervals: readonly PumpSuspensionInterval[]
): PumpActivityLaneInterval[] {
  const items: Omit<PumpActivityLaneInterval, "lane">[] = [
    ...activityIntervals.map((interval) => ({
      startMs: interval.startMs,
      endMs: interval.endMs,
      kind: interval.mode,
      hasConfirmedResume: false,
    })),
    ...suspensionIntervals.map((interval) => ({
      startMs: interval.startMs,
      endMs: interval.endMs,
      kind: "suspension" as const,
      hasConfirmedResume: interval.hasConfirmedResume,
    })),
  ].sort(
    (left, right) =>
      left.startMs - right.startMs ||
      left.kind.localeCompare(right.kind) ||
      left.endMs - right.endMs
  );
  const laneEndMs: number[] = [];

  return items.map((item) => {
    let lane = laneEndMs.findIndex((endMs) => endMs <= item.startMs);
    if (lane === -1) {
      lane = laneEndMs.length;
    }
    laneEndMs[lane] = item.endMs;
    return { ...item, lane };
  });
}

export function normalizePumpTimeline(
  events: readonly PumpEventReading[]
): PumpTimelineData {
  return {
    basalSegments: normalizePumpBasalSegments(events),
    activityIntervals: derivePumpActivityIntervals(events),
    suspensionIntervals: derivePumpSuspensionIntervals(events),
  };
}
