/**
 * @jest-environment node
 */
import type { SetupServer } from "msw/node";

import {
  isKnownBolusReviewEventType,
  normalizeInsulinDoseTimeline,
} from "@/components/InsulinTimeline/insulin-timeline-data";

import {
  activeAlertFixture,
  bolusReviewUnknownEventTypeFixture,
  forecastResponseFixture,
  glucoseReadingFixture,
  integrationConnectionStateFixture,
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

// msw's sse() requires an EventSource constructor at module load, which the
// Jest node environment does not provide (mirrors handlers.test.ts -- this
// file imports ./handlers too, for the real-handler-chain test below).
if (!("EventSource" in globalThis)) {
  Object.defineProperty(globalThis, "EventSource", {
    value: class EventSource {},
    configurable: true,
  });
}

let server: SetupServer;

beforeAll(async () => {
  const { setupServer } = await import("msw/node");
  const { handlers } = await import("./handlers");
  server = setupServer(...handlers);
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

describe("shared contract fixtures", () => {
  it("keeps the glucose reading within the canonical mg/dL safety bound", () => {
    expect(glucoseReadingFixture.value).toBeGreaterThanOrEqual(20);
    expect(glucoseReadingFixture.value).toBeLessThanOrEqual(500);
    expect(
      new Date(glucoseReadingFixture.received_at).getTime(),
    ).toBeGreaterThanOrEqual(
      new Date(glucoseReadingFixture.reading_timestamp).getTime(),
    );
  });

  it("gives a manual meal bolus positive carb evidence and no automation flag", () => {
    expect(pumpEventManualMealBolusFixture.event_type).toBe("bolus");
    expect(pumpEventManualMealBolusFixture.is_automated).toBe(false);
    expect(pumpEventManualMealBolusFixture.cob_at_event).not.toBeNull();
    expect(pumpEventManualMealBolusFixture.cob_at_event ?? 0).toBeGreaterThan(
      0,
    );
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

  it("flags an automated correction as automated with a Control-IQ reason", () => {
    expect(pumpEventAutomatedCorrectionFixture.event_type).toBe("correction");
    expect(pumpEventAutomatedCorrectionFixture.is_automated).toBe(true);
    expect(
      pumpEventAutomatedCorrectionFixture.control_iq_reason,
    ).toBeTruthy();
  });

  it("does not conflate manual and automated boluses that share event_type", () => {
    // A Nightscout SMB lands as event_type=bolus, same as a manual meal
    // dose -- is_automated is the only field that distinguishes them.
    expect(pumpEventNightscoutSmbFixture.event_type).toBe(
      pumpEventManualMealBolusFixture.event_type,
    );
    expect(pumpEventNightscoutSmbFixture.is_automated).toBe(true);
    expect(pumpEventManualMealBolusFixture.is_automated).toBe(false);
    expect(pumpEventNightscoutSmbFixture.source).toMatch(/^nightscout/);
  });

  it("reports basal as a rate over a duration, not a one-time dose", () => {
    expect(pumpEventBasalRateFixture.event_type).toBe("basal");
    expect(pumpEventBasalRateFixture.duration_minutes ?? 0).toBeGreaterThan(
      0,
    );
    expect(pumpEventBasalRateFixture.units ?? 0).toBeGreaterThan(0);
    expect(pumpEventBasalRateFixture.units ?? 0).toBeLessThan(15);
  });

  it("reports a long-acting injection as an absolute dose, not a rate", () => {
    expect(pumpEventLongActingBasalInjectionFixture.event_type).toBe(
      "basal_injection",
    );
    expect(
      pumpEventLongActingBasalInjectionFixture.duration_minutes,
    ).toBeNull();
    expect(
      pumpEventLongActingBasalInjectionFixture.units ?? 0,
    ).toBeGreaterThan(0);
    expect(
      pumpEventLongActingBasalInjectionFixture.units ?? 0,
    ).toBeLessThanOrEqual(160);
  });

  it("produces a suspend/resume pair with a positive, bounded delivery gap", () => {
    expect(pumpEventSuspendFixture.event_type).toBe("suspend");
    expect(pumpEventResumeFixture.event_type).toBe("resume");
    const suspendMs = new Date(
      pumpEventSuspendFixture.event_timestamp,
    ).getTime();
    const resumeMs = new Date(
      pumpEventResumeFixture.event_timestamp,
    ).getTime();
    const suspendedMinutes = (resumeMs - suspendMs) / 60_000;
    expect(suspendedMinutes).toBeGreaterThan(0);
    expect(suspendedMinutes).toBeLessThanOrEqual(180);
  });

  it("keeps the forecast curve length consistent with its step and horizon", () => {
    const forecast = forecastResponseFixture.forecast;
    expect(forecast).not.toBeNull();
    const curve = forecast?.curves_mgdl.main ?? null;
    expect(curve).not.toBeNull();
    expect(curve).toHaveLength(
      (forecast?.horizon_minutes ?? 0) / (forecast?.step_minutes ?? 1),
    );
  });

  it("keeps the active alert glucose value within the canonical safety bound", () => {
    expect(activeAlertFixture.current_value).toBeGreaterThanOrEqual(20);
    expect(activeAlertFixture.current_value).toBeLessThanOrEqual(500);
    expect(new Date(activeAlertFixture.expires_at).getTime()).toBeGreaterThan(
      new Date(activeAlertFixture.created_at).getTime(),
    );
  });

  it("carries the SSE event discriminator on live glucose and alert events", () => {
    expect(liveGlucoseEventFixture.event).toBe("glucose");
    expect(liveAlertEventFixture.event).toBe("alert");
  });

  it("reports a connected integration state", () => {
    expect(integrationConnectionStateFixture.status).toBe("connected");
    expect(integrationConnectionStateFixture.integration_type).toBe(
      "tandem",
    );
  });

  it("proves the unknown future event type is never treated as a known bolus", () => {
    expect(
      isKnownBolusReviewEventType(bolusReviewUnknownEventTypeFixture.event_type),
    ).toBe(false);

    // Run the real classification logic the dashboard uses, not a
    // reimplementation of it.
    const { rapidDoses, longActingBasalInjections } =
      normalizeInsulinDoseTimeline([bolusReviewUnknownEventTypeFixture]);
    expect(rapidDoses).toHaveLength(0);
    expect(longActingBasalInjections).toHaveLength(0);
  });

  it("serves a shared fixture through the real MSW setupServer handler chain", async () => {
    const { http, HttpResponse } = await import("msw");
    server.use(
      http.get("*/api/integrations/glucose/history", () =>
        HttpResponse.json({ readings: [glucoseReadingFixture], count: 1 }),
      ),
    );

    const response = await fetch(
      "http://localhost:3003/api/integrations/glucose/history",
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ readings: [glucoseReadingFixture], count: 1 });
  });
});
