/**
 * Shared contract fixtures under contracts/fixtures/, typed against the
 * generated OpenAPI schema (GLY-181). Each `satisfies` check below means a
 * backend contract change that reshapes one of these responses fails
 * `tsc` here instead of drifting silently -- see fixtures.test.ts for the
 * runtime semantic assertions and contracts/fixtures/README.md for the
 * cross-language contract.
 *
 * apps/api/tests/test_contract_fixtures.py is the Python half: it parses
 * the same JSON files through the Pydantic models that define these shapes.
 */
import type {
  ForecastEngine,
  ForecastReadResponse,
  IntegrationResponse,
  PredictiveAlert,
  PumpEventReading,
} from "@/lib/api";
import type { Schemas } from "@/lib/wire-types";

import activeAlertJson from "../../../../contracts/fixtures/active_alert.json";
import bolusReviewUnknownEventTypeJson from "../../../../contracts/fixtures/bolus_review_unknown_event_type.json";
import forecastResponseJson from "../../../../contracts/fixtures/forecast_response.json";
import glucoseReadingJson from "../../../../contracts/fixtures/glucose_reading.json";
import integrationConnectionStateJson from "../../../../contracts/fixtures/integration_connection_state.json";
import liveAlertEventJson from "../../../../contracts/fixtures/live_alert_event.json";
import liveGlucoseEventJson from "../../../../contracts/fixtures/live_glucose_event.json";
import pumpEventAutomatedCorrectionJson from "../../../../contracts/fixtures/pump_event_automated_correction.json";
import pumpEventBasalRateJson from "../../../../contracts/fixtures/pump_event_basal_rate.json";
import pumpEventLongActingBasalInjectionJson from "../../../../contracts/fixtures/pump_event_long_acting_basal_injection.json";
import pumpEventManualCorrectionJson from "../../../../contracts/fixtures/pump_event_manual_correction.json";
import pumpEventManualMealBolusJson from "../../../../contracts/fixtures/pump_event_manual_meal_bolus.json";
import pumpEventNightscoutSmbJson from "../../../../contracts/fixtures/pump_event_nightscout_smb.json";
import pumpEventResumeJson from "../../../../contracts/fixtures/pump_event_resume.json";
import pumpEventSuspendJson from "../../../../contracts/fixtures/pump_event_suspend.json";

// JSON module imports infer widened primitive types (`string`, not the
// literal `"flat"`), so a field typed as a literal union on the generated
// schema needs an explicit cast back to that union here. This does not
// weaken the check: every OTHER field -- names, presence, and non-literal
// types -- still goes through `satisfies` structurally, so a renamed,
// removed, or newly-required field still fails `tsc`. Whether a fixture's
// literal *value* is actually a legal enum member is what the Pydantic
// round trip in test_contract_fixtures.py verifies at runtime.
function withLiteral<T, K extends keyof T, V extends T[K]>(
  json: T,
  key: K,
  value: V,
): Omit<T, K> & Record<K, V> {
  return { ...json, [key]: value };
}

export const glucoseReadingFixture = withLiteral(
  glucoseReadingJson,
  "trend",
  glucoseReadingJson.trend as Schemas["GlucoseReadingResponse"]["trend"],
) satisfies Schemas["GlucoseReadingResponse"];

function pumpEventFixture<T extends { event_type: string }>(
  json: T,
): Omit<T, "event_type"> & { event_type: PumpEventReading["event_type"] } {
  return {
    ...json,
    event_type: json.event_type as PumpEventReading["event_type"],
  };
}

export const pumpEventManualMealBolusFixture = pumpEventFixture(
  pumpEventManualMealBolusJson,
) satisfies PumpEventReading;
export const pumpEventManualCorrectionFixture = pumpEventFixture(
  pumpEventManualCorrectionJson,
) satisfies PumpEventReading;
export const pumpEventAutomatedCorrectionFixture = pumpEventFixture(
  pumpEventAutomatedCorrectionJson,
) satisfies PumpEventReading;
export const pumpEventNightscoutSmbFixture = pumpEventFixture(
  pumpEventNightscoutSmbJson,
) satisfies PumpEventReading;
export const pumpEventBasalRateFixture = pumpEventFixture(
  pumpEventBasalRateJson,
) satisfies PumpEventReading;
export const pumpEventLongActingBasalInjectionFixture = pumpEventFixture(
  pumpEventLongActingBasalInjectionJson,
) satisfies PumpEventReading;
export const pumpEventSuspendFixture = pumpEventFixture(
  pumpEventSuspendJson,
) satisfies PumpEventReading;
export const pumpEventResumeFixture = pumpEventFixture(
  pumpEventResumeJson,
) satisfies PumpEventReading;

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

export const activeAlertFixture = activeAlertJson satisfies PredictiveAlert;

export const liveGlucoseEventFixture = {
  ...liveGlucoseEventJson,
  event: liveGlucoseEventJson.event as Schemas["SseGlucosePayload"]["event"],
  trend: liveGlucoseEventJson.trend as Schemas["SseGlucosePayload"]["trend"],
} satisfies Schemas["SseGlucosePayload"];

export const liveAlertEventFixture = {
  ...liveAlertEventJson,
  event: liveAlertEventJson.event as Schemas["SseAlertPayload"]["event"],
} satisfies Schemas["SseAlertPayload"];

export const integrationConnectionStateFixture = {
  ...integrationConnectionStateJson,
  integration_type:
    integrationConnectionStateJson.integration_type as IntegrationResponse["integration_type"],
  status:
    integrationConnectionStateJson.status as IntegrationResponse["status"],
} satisfies IntegrationResponse;

// The one deliberately open escape hatch: BolusReviewItem.event_type is a
// plain string on the wire (see the schema docstring), so an
// unrecognized value still satisfies the type -- unlike PumpEventReading's
// closed PumpEventType enum, which would fail this check for the same value.
export const bolusReviewUnknownEventTypeFixture =
  bolusReviewUnknownEventTypeJson satisfies Schemas["BolusReviewItem"];
