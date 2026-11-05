/**
 * @jest-environment node
 *
 * Runtime half of the shared contract fixtures (GLY-181). `fixtures.ts` proves
 * their SHAPE at compile time; this file pins the semantics a type cannot carry
 * -- canonical mg/dL bounds, insulin units vs rates, manual vs automated not
 * conflated -- and proves an unknown event type is dropped rather than guessed
 * into a bolus by the real production code.
 *
 * The two SSE fixtures are validated in Python against their Pydantic payload
 * models; their value here is that both languages read the SAME file, so the
 * assertions below are about the invariants, not a second parse.
 */
import { readdirSync } from "node:fs";
import path from "node:path";

import {
  isKnownBolusReviewEventType,
  normalizeInsulinDoseTimeline,
} from "@/components/InsulinTimeline/insulin-timeline-data";
import type { GlucoseHistoryResponse } from "@/lib/api";
import {
  GLUCOSE_VALID_RANGE_MGDL,
  isValidGlucoseMgdl,
} from "@/lib/glucose-classification";
import { INSULIN_DOSE_LIMITS } from "@/lib/insulin";

import { bolusReviewUnknownEventTypeRow } from "./data";
import {
  CONTRACT_FIXTURES,
  activeAlertFixture,
  bolusReviewUnknownEventTypeFixture,
  forecastResponseFixture,
  glucoseReadingFixture,
  integrationConnectionStateFixture,
  liveAlertEventCaregiverFixture,
  liveAlertEventFixture,
  liveGlucoseEventFixture,
  pumpEventAutomatedCorrectionFixture,
  pumpEventBasalRateFixture,
  pumpEventLongActingBasalInjectionFixture,
  pumpEventManualCorrectionFixture,
  pumpEventManualMealBolusFixture,
  pumpEventNightscoutSmbFixture,
  pumpEventResumeFixture,
  pumpEventSuspendFixture,
} from "./fixtures";
import { setupMockApiServer } from "./test-server";

setupMockApiServer();

const FIXTURES_DIR = path.resolve(__dirname, "../../../../contracts/fixtures");

// A basal RATE is U/h; anything near a bolus-sized number here would mean the
// fixture confused a rate with a dose.
const MAX_PLAUSIBLE_BASAL_RATE_UNITS_PER_HOUR = 15;

describe("shared contract fixtures", () => {
  it("imports every fixture file on disk", () => {
    const onDisk = readdirSync(FIXTURES_DIR)
      .filter((name) => name.endsWith(".json"))
      .sort();
    expect(onDisk).toEqual(Object.keys(CONTRACT_FIXTURES).sort());
  });

  it("keeps the glucose reading within the canonical mg/dL safety bound", () => {
    expect(isValidGlucoseMgdl(glucoseReadingFixture.value)).toBe(true);
    expect(
      new Date(glucoseReadingFixture.received_at).getTime(),
    ).toBeGreaterThanOrEqual(
      new Date(glucoseReadingFixture.reading_timestamp).getTime(),
    );
  });

  it("gives a manual meal bolus positive carb evidence and no automation flag", () => {
    const { cob_at_event: cob } = pumpEventManualMealBolusFixture;
    expect(pumpEventManualMealBolusFixture.is_automated).toBe(false);
    if (cob === null) throw new Error("meal bolus fixture lost its carb evidence");
    expect(cob).toBeGreaterThan(0);
  });

  it("never guesses correction purpose from event_type alone for a manual correction", () => {
    // Wire-identical event_type to the meal bolus fixture; only cob_at_event
    // (absent here) and source (present, not a guess) tell them apart.
    expect(pumpEventManualCorrectionFixture.event_type).toBe(
      pumpEventManualMealBolusFixture.event_type,
    );
    expect(pumpEventManualCorrectionFixture.is_automated).toBe(false);
    expect(pumpEventManualCorrectionFixture.cob_at_event).toBeNull();
    expect(pumpEventManualCorrectionFixture.source).toBeTruthy();
  });

  it("flags an automated correction as automated with the Control-IQ reason the mapper writes", () => {
    expect(pumpEventAutomatedCorrectionFixture.is_automated).toBe(true);
    expect(pumpEventAutomatedCorrectionFixture.control_iq_reason).toBe(
      "correction",
    );
  });

  it("does not conflate manual and automated boluses that share event_type", () => {
    // A Nightscout SMB lands as event_type=bolus, same as a manual meal
    // dose -- is_automated is the only field that distinguishes them.
    expect(pumpEventNightscoutSmbFixture.event_type).toBe(
      pumpEventManualMealBolusFixture.event_type,
    );
    expect(pumpEventNightscoutSmbFixture.is_automated).toBe(true);
    expect(pumpEventManualMealBolusFixture.is_automated).toBe(false);
    // The translator stamps `nightscout:<connection_id>`, never a bare
    // uploader label -- the Python half pins the full format.
    expect(pumpEventNightscoutSmbFixture.source).toMatch(/^nightscout:/);
  });

  it("reports basal as a rate over a duration, not a one-time dose", () => {
    const { duration_minutes: duration, units } = pumpEventBasalRateFixture;
    if (duration === null) throw new Error("basal rate fixture lost its duration");
    if (units === null) throw new Error("basal rate fixture lost its rate");
    expect(duration).toBeGreaterThan(0);
    expect(units).toBeGreaterThan(0);
    expect(units).toBeLessThan(MAX_PLAUSIBLE_BASAL_RATE_UNITS_PER_HOUR);
  });

  it("reports a long-acting injection as an absolute dose, not a rate", () => {
    const { units } = pumpEventLongActingBasalInjectionFixture;
    expect(pumpEventLongActingBasalInjectionFixture.duration_minutes).toBeNull();
    if (units === null) throw new Error("basal injection fixture lost its dose");
    expect(units).toBeGreaterThan(0);
    expect(units).toBeLessThanOrEqual(
      INSULIN_DOSE_LIMITS.maxBasalInjectionUnits,
    );
  });

  it("produces a suspend/resume pair with a positive, bounded delivery gap", () => {
    const suspendMs = new Date(
      pumpEventSuspendFixture.event_timestamp,
    ).getTime();
    const resumeMs = new Date(pumpEventResumeFixture.event_timestamp).getTime();
    const suspendedMinutes = Math.floor((resumeMs - suspendMs) / 60_000);
    expect(suspendedMinutes).toBeGreaterThan(0);
    expect(suspendedMinutes).toBeLessThanOrEqual(180);
  });

  it("keeps the forecast curve length consistent with its step and horizon", () => {
    const forecast = forecastResponseFixture.forecast;
    if (!forecast) throw new Error("forecast fixture lost its payload");
    const curve = forecast.curves_mgdl.main;
    if (!curve) throw new Error("forecast fixture lost its main curve");
    expect(curve).toHaveLength(
      Math.floor(forecast.horizon_minutes / forecast.step_minutes),
    );
  });

  it("keeps the active alert glucose value within the canonical safety bound", () => {
    expect(isValidGlucoseMgdl(activeAlertFixture.current_value)).toBe(true);
    expect(new Date(activeAlertFixture.expires_at).getTime()).toBeGreaterThan(
      new Date(activeAlertFixture.created_at).getTime(),
    );
    // A prediction is an extrapolation, not a measurement, so it is NOT bound
    // by the 20-500 reading range -- an urgent low is precisely the case that
    // projects below it. It must still be a real number.
    expect(Number.isFinite(activeAlertFixture.predicted_value)).toBe(true);
  });

  it("distinguishes the caregiver live-alert form by the presence of patient_name", () => {
    // The backend omits the key entirely outside a caregiver stream; a client
    // that treats "absent" and "null" differently must see both forms.
    expect("patient_name" in liveAlertEventFixture).toBe(false);
    expect(liveAlertEventCaregiverFixture.patient_name).toBeTruthy();
    expect(isValidGlucoseMgdl(liveAlertEventFixture.current_value)).toBe(true);
  });

  it("keeps the live glucose event in canonical mg/dL", () => {
    expect(isValidGlucoseMgdl(liveGlucoseEventFixture.value)).toBe(true);
    expect(liveGlucoseEventFixture.value).toBeGreaterThanOrEqual(
      GLUCOSE_VALID_RANGE_MGDL.min,
    );
  });

  it("reports a connected integration state", () => {
    expect(integrationConnectionStateFixture.status).toBe("connected");
    expect(integrationConnectionStateFixture.integration_type).toBe("tandem");
  });

  it("keeps the DevMockPanel's inline unknown-event row (GLY-270, src/mocks/data.ts) pinned to this fixture", () => {
    // `data.ts` cannot import `bolusReviewUnknownEventTypeFixture` directly --
    // it is part of the real Next.js bundle, and this file's
    // `contracts/fixtures/*.json` imports do not resolve inside the web
    // Docker build context. So `data.ts` keeps its own inline copy; this test
    // is what keeps that copy from silently drifting. `event_timestamp` is
    // excluded because the inline copy's caller always overrides it with the
    // request window's own end time.
    const { event_timestamp: _rowTimestamp, ...rowRest } =
      bolusReviewUnknownEventTypeRow;
    const { event_timestamp: _fixtureTimestamp, ...fixtureRest } =
      bolusReviewUnknownEventTypeFixture;

    expect(rowRest).toEqual(fixtureRest);
  });

  it("drops an unknown future event type instead of guessing it into a bolus", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(
        isKnownBolusReviewEventType(
          bolusReviewUnknownEventTypeFixture.event_type,
        ),
      ).toBe(false);

      // Run the real classification logic the dashboard uses, not a
      // reimplementation of it.
      const { rapidDoses, longActingBasalInjections } =
        normalizeInsulinDoseTimeline([bolusReviewUnknownEventTypeFixture]);
      expect(rapidDoses).toHaveLength(0);
      expect(longActingBasalInjections).toHaveLength(0);

      // Dropping it silently would be the real failure: the skip has to be
      // observable (console breadcrumbs feed Sentry where configured).
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          bolusReviewUnknownEventTypeFixture.event_type,
        ),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("serves contract-shaped glucose history through the real MSW handler chain", async () => {
    // No `server.use` stub: this hits the production mock handler, so a mock
    // payload that drifts from the shared fixture's shape fails here.
    const response = await fetch(
      "https://mock.invalid/api/integrations/glucose/history?hours=6",
    );
    const body = (await response.json()) as GlucoseHistoryResponse;

    expect(response.status).toBe(200);
    expect(body.count).toBe(body.readings.length);
    const reading = body.readings[0];
    if (!reading) throw new Error("mock glucose history returned no readings");

    expect(Object.keys(reading).sort()).toEqual(
      Object.keys(glucoseReadingFixture).sort(),
    );
    expect(isValidGlucoseMgdl(reading.value)).toBe(true);
  });
});
