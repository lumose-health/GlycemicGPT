/**
 * Shared contract fixtures under `contracts/fixtures/`, typed against the
 * generated OpenAPI schema (GLY-181). Each `satisfies` check below means a
 * backend contract change that reshapes one of these responses fails `tsc`
 * here instead of drifting silently -- see `fixtures.test.ts` for the runtime
 * semantic assertions and `contracts/fixtures/README.md` for the cross-language
 * contract.
 *
 * `apps/api/tests/test_contract_fixtures.py` is the Python half: it parses the
 * same JSON files through the Pydantic models that define these shapes, and it
 * -- not this file -- is what proves a literal *value* is one the backend can
 * actually emit.
 *
 * Two conventions here:
 *
 * 1. The `satisfies` target is the `@/lib/api` alias wherever one exists, not
 *    the raw `Schemas[...]`. FastAPI marks an `Optional[X] = None` field "not
 *    required" even though it always serializes it, so the raw generated type
 *    would let a fixture drop an always-sent field and still type-check; the
 *    `AlwaysSent`-wrapped aliases are the shape consumers actually rely on.
 *    `SseAlertPayload.patient_name` is the one genuinely conditional key (the
 *    backend omits it outside a caregiver stream) and is wrapped accordingly.
 *
 * 2. JSON module imports widen string literals (`string`, not `"flat"`), so a
 *    field typed as a literal union needs an explicit cast back to that union.
 *    That does not weaken the check: every other field -- names, presence, and
 *    non-literal types -- still goes through `satisfies` structurally, so a
 *    renamed, removed, or newly-required field still fails `tsc`.
 */
import type {
  BolusReviewItem,
  ForecastEngine,
  ForecastReadResponse,
  GlucoseHistoryReading,
  IntegrationResponse,
  PredictiveAlert,
  PumpEventReading,
} from "@/lib/api";
import type { AlwaysSent, Schemas } from "@/lib/wire-types";

import activeAlertJson from "../../../../contracts/fixtures/active_alert.json";
import bolusReviewUnknownEventTypeJson from "../../../../contracts/fixtures/bolus_review_unknown_event_type.json";
import forecastResponseJson from "../../../../contracts/fixtures/forecast_response.json";
import glucoseReadingJson from "../../../../contracts/fixtures/glucose_reading.json";
import integrationConnectionStateJson from "../../../../contracts/fixtures/integration_connection_state.json";
import liveAlertEventJson from "../../../../contracts/fixtures/live_alert_event.json";
import liveAlertEventCaregiverJson from "../../../../contracts/fixtures/live_alert_event_caregiver.json";
import liveGlucoseEventJson from "../../../../contracts/fixtures/live_glucose_event.json";
import pumpEventAutomatedCorrectionJson from "../../../../contracts/fixtures/pump_event_automated_correction.json";
import pumpEventBasalRateJson from "../../../../contracts/fixtures/pump_event_basal_rate.json";
import pumpEventLongActingBasalInjectionJson from "../../../../contracts/fixtures/pump_event_long_acting_basal_injection.json";
import pumpEventManualCorrectionJson from "../../../../contracts/fixtures/pump_event_manual_correction.json";
import pumpEventManualMealBolusJson from "../../../../contracts/fixtures/pump_event_manual_meal_bolus.json";
import pumpEventNightscoutSmbJson from "../../../../contracts/fixtures/pump_event_nightscout_smb.json";
import pumpEventResumeJson from "../../../../contracts/fixtures/pump_event_resume.json";
import pumpEventSuspendJson from "../../../../contracts/fixtures/pump_event_suspend.json";

/** `GET /api/v1/glucose/stream` `glucose` event. No `@/lib/api` alias exists
 * (the web client reads the stream through the SSE proxy, not a typed client),
 * so the always-sent widening is applied here. */
type SseGlucoseEvent = AlwaysSent<Schemas["SseGlucosePayload"]>;

/**
 * `GET /api/v1/alerts/stream` `alert` event. Every key is always sent EXCEPT
 * `patient_name`: `alert_api.alert_to_dict` adds it only for a caregiver's
 * fan-in stream and omits the key entirely otherwise, so it stays optional
 * while the rest are widened back to required.
 */
type SseAlertEvent = AlwaysSent<
  Schemas["SseAlertPayload"],
  Exclude<keyof Schemas["SseAlertPayload"], "patient_name">
>;

export const glucoseReadingFixture = {
  ...glucoseReadingJson,
  trend: glucoseReadingJson.trend as GlucoseHistoryReading["trend"],
} satisfies GlucoseHistoryReading;

export const pumpEventManualMealBolusFixture = {
  ...pumpEventManualMealBolusJson,
  event_type:
    pumpEventManualMealBolusJson.event_type as PumpEventReading["event_type"],
} satisfies PumpEventReading;

export const pumpEventManualCorrectionFixture = {
  ...pumpEventManualCorrectionJson,
  event_type:
    pumpEventManualCorrectionJson.event_type as PumpEventReading["event_type"],
} satisfies PumpEventReading;

export const pumpEventAutomatedCorrectionFixture = {
  ...pumpEventAutomatedCorrectionJson,
  event_type:
    pumpEventAutomatedCorrectionJson.event_type as PumpEventReading["event_type"],
} satisfies PumpEventReading;

export const pumpEventNightscoutSmbFixture = {
  ...pumpEventNightscoutSmbJson,
  event_type:
    pumpEventNightscoutSmbJson.event_type as PumpEventReading["event_type"],
} satisfies PumpEventReading;

export const pumpEventBasalRateFixture = {
  ...pumpEventBasalRateJson,
  event_type:
    pumpEventBasalRateJson.event_type as PumpEventReading["event_type"],
} satisfies PumpEventReading;

export const pumpEventLongActingBasalInjectionFixture = {
  ...pumpEventLongActingBasalInjectionJson,
  event_type:
    pumpEventLongActingBasalInjectionJson.event_type as PumpEventReading["event_type"],
} satisfies PumpEventReading;

export const pumpEventSuspendFixture = {
  ...pumpEventSuspendJson,
  event_type: pumpEventSuspendJson.event_type as PumpEventReading["event_type"],
} satisfies PumpEventReading;

export const pumpEventResumeFixture = {
  ...pumpEventResumeJson,
  event_type: pumpEventResumeJson.event_type as PumpEventReading["event_type"],
} satisfies PumpEventReading;

export const forecastResponseFixture = {
  ...forecastResponseJson,
  source_preference:
    forecastResponseJson.source_preference as ForecastReadResponse["source_preference"],
  effective_source:
    forecastResponseJson.effective_source as ForecastReadResponse["effective_source"],
  available_sources:
    forecastResponseJson.available_sources as ForecastReadResponse["available_sources"],
  forecast: {
    ...forecastResponseJson.forecast,
    source_engine: forecastResponseJson.forecast
      .source_engine as ForecastEngine,
  },
} satisfies ForecastReadResponse;

// `AlertResponse` publishes `alert_type`, `severity` and `source` as plain
// strings, so nothing here needs a cast -- and nothing here can catch a
// fabricated value either. The Python half derives this fixture from the real
// alert engine, which is what pins those three fields.
export const activeAlertFixture = activeAlertJson satisfies PredictiveAlert;

export const liveGlucoseEventFixture = {
  ...liveGlucoseEventJson,
  event: liveGlucoseEventJson.event as SseGlucoseEvent["event"],
  trend: liveGlucoseEventJson.trend as SseGlucoseEvent["trend"],
} satisfies SseGlucoseEvent;

export const liveAlertEventFixture = {
  ...liveAlertEventJson,
  event: liveAlertEventJson.event as SseAlertEvent["event"],
} satisfies SseAlertEvent;

export const liveAlertEventCaregiverFixture = {
  ...liveAlertEventCaregiverJson,
  event: liveAlertEventCaregiverJson.event as SseAlertEvent["event"],
} satisfies SseAlertEvent;

export const integrationConnectionStateFixture = {
  ...integrationConnectionStateJson,
  integration_type:
    integrationConnectionStateJson.integration_type as IntegrationResponse["integration_type"],
  status:
    integrationConnectionStateJson.status as IntegrationResponse["status"],
} satisfies IntegrationResponse;

// `BolusReviewItem.event_type` is a plain string on the wire, so this
// unrecognized value satisfies the type where `PumpEventReading`'s closed
// `PumpEventType` enum would reject it. That looseness is a documented KNOWN
// GAP, not a designed escape hatch -- the schema's own description names only
// `bolus | correction | basal_injection`, and pinning the TypeScript side to
// that list with a `Literal` is filed as GLY-241 (see the comment on
// `BolusReviewItem` in `lib/api.ts` and on `KNOWN_BOLUS_REVIEW_EVENT_TYPES` in
// `InsulinTimeline/insulin-timeline-data.ts`). Until it closes, every consumer
// must gate on `isKnownBolusReviewEventType`; this fixture is what proves they
// do.
export const bolusReviewUnknownEventTypeFixture =
  bolusReviewUnknownEventTypeJson satisfies BolusReviewItem;

/**
 * The TypeScript-side inventory, keyed by filename. This is the single list
 * `fixtures.test.ts` globs `contracts/fixtures/` against, so a fixture added to
 * disk without a typed import here fails jest rather than shipping unchecked.
 */
export const CONTRACT_FIXTURES = {
  "active_alert.json": activeAlertFixture,
  "bolus_review_unknown_event_type.json": bolusReviewUnknownEventTypeFixture,
  "forecast_response.json": forecastResponseFixture,
  "glucose_reading.json": glucoseReadingFixture,
  "integration_connection_state.json": integrationConnectionStateFixture,
  "live_alert_event.json": liveAlertEventFixture,
  "live_alert_event_caregiver.json": liveAlertEventCaregiverFixture,
  "live_glucose_event.json": liveGlucoseEventFixture,
  "pump_event_automated_correction.json": pumpEventAutomatedCorrectionFixture,
  "pump_event_basal_rate.json": pumpEventBasalRateFixture,
  "pump_event_long_acting_basal_injection.json":
    pumpEventLongActingBasalInjectionFixture,
  "pump_event_manual_correction.json": pumpEventManualCorrectionFixture,
  "pump_event_manual_meal_bolus.json": pumpEventManualMealBolusFixture,
  "pump_event_nightscout_smb.json": pumpEventNightscoutSmbFixture,
  "pump_event_resume.json": pumpEventResumeFixture,
  "pump_event_suspend.json": pumpEventSuspendFixture,
} as const;
