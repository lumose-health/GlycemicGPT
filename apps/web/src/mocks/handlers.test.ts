/**
 * @jest-environment node
 */
import type { SetupServer } from "msw/node";

import { getMissingMockApiHandlerDetail } from "./guard";

// msw's sse() requires an EventSource constructor at module load, which the
// Jest node environment does not provide.
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

afterAll(() => {
  server.close();
});

beforeEach(async () => {
  const { setMockRuntimeState } = await import("./state");
  setMockRuntimeState({
    apiUnavailable: false,
    userRole: "diabetic",
    aiChatScenario: "connected",
    cgmSources: ["dexcom"],
    pumpSources: ["tandem"],
    forecastSourcePreference: "auto",
    tandemSyncEnabled: true,
    tandemSyncIntervalMinutes: 15,
    tandemAutomaticSyncShouldFail: false,
    tandemSyncShouldFail: false,
    knowledgeDocumentCount: 1,
    displayName: "Mock Patient",
    glucoseUnit: "mgdl",
  });
});

describe("mock API handlers", () => {
  it("paginates the configured knowledge base documents", async () => {
    const { setMockRuntimeState } = await import("./state");
    setMockRuntimeState({ knowledgeDocumentCount: 45 });

    const response = await fetch(
      "http://localhost:3003/api/knowledge/documents?page=2&page_size=20",
    );
    const body = (await response.json()) as {
      documents: Array<{ source_name: string }>;
      page: number;
      page_size: number;
      total_documents: number;
    };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      page: 2,
      page_size: 20,
      total_documents: 45,
    });
    expect(body.documents).toHaveLength(20);
    expect(body.documents[0]?.source_name).toBe(
      "Personal Diabetes Management Notes 3",
    );
  });

  it("filters mocked knowledge documents and derives matching statistics", async () => {
    const { setMockRuntimeState } = await import("./state");
    setMockRuntimeState({ knowledgeDocumentCount: 24 });

    const [documentsResponse, statsResponse] = await Promise.all([
      fetch(
        "http://localhost:3003/api/knowledge/documents?trust_tier=AUTHORITATIVE&search=consensus",
      ),
      fetch("http://localhost:3003/api/knowledge/stats"),
    ]);
    const documents = (await documentsResponse.json()) as {
      documents: Array<{ trust_tier: string }>;
      total_documents: number;
    };
    const stats = (await statsResponse.json()) as {
      by_tier: Record<string, number>;
      total_documents: number;
      total_chunks: number;
    };

    expect(documents.total_documents).toBe(3);
    expect(documents.documents).toHaveLength(3);
    expect(documents.documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ trust_tier: "AUTHORITATIVE" }),
      ]),
    );
    expect(stats.total_documents).toBe(24);
    expect(stats.total_chunks).toBeGreaterThan(24);
    expect(stats.by_tier.AUTHORITATIVE).toBeGreaterThan(0);
  });

  it("returns a successful AI chat response when the provider is connected", async () => {
    const providerResponse = await fetch(
      "http://localhost:3003/api/ai/provider",
    );
    const chatResponse = await fetch("http://localhost:3003/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "How am I doing?" }),
    });

    expect(providerResponse.status).toBe(200);
    expect(chatResponse.status).toBe(200);
    await expect(chatResponse.json()).resolves.toMatchObject({
      response: "Mock response to: How am I doing?",
      conversation_id: "mock-conversation",
    });
  });

  it.each([
    ["not-configured", 404, "No AI provider configured"],
    ["server-unavailable", 503, "AI service is unavailable"],
  ] as const)(
    "returns the %s AI provider check scenario",
    async (aiChatScenario, expectedStatus, expectedDetail) => {
      const { setMockRuntimeState } = await import("./state");
      setMockRuntimeState({ aiChatScenario });

      const response = await fetch("http://localhost:3003/api/ai/provider");

      expect(response.status).toBe(expectedStatus);
      await expect(response.json()).resolves.toEqual({
        detail: expectedDetail,
      });
    },
  );

  it.each([
    ["provider-error", 502, "Unable to get a response from the AI provider"],
    ["empty-response", 502, "The AI returned an empty response"],
    ["disconnect-on-send", 404, "No AI provider configured"],
  ] as const)(
    "returns the %s AI message scenario",
    async (aiChatScenario, expectedStatus, expectedDetail) => {
      const { setMockRuntimeState } = await import("./state");
      setMockRuntimeState({ aiChatScenario });

      const providerResponse = await fetch(
        "http://localhost:3003/api/ai/provider",
      );
      const chatResponse = await fetch("http://localhost:3003/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Test scenario" }),
      });

      expect(providerResponse.status).toBe(200);
      expect(chatResponse.status).toBe(expectedStatus);
      await expect(chatResponse.json()).resolves.toEqual({
        detail: expectedDetail,
      });
    },
  );

  it("returns 503 for every API route during a complete outage", async () => {
    const { setMockRuntimeState } = await import("./state");
    setMockRuntimeState({ apiUnavailable: true });

    const [coveredResponse, uncoveredResponse] = await Promise.all([
      fetch("http://localhost:3003/api/auth/me"),
      fetch("http://localhost:3003/api/mock-uncovered-route", {
        method: "POST",
      }),
    ]);

    expect(coveredResponse.status).toBe(503);
    expect(uncoveredResponse.status).toBe(503);
    await expect(coveredResponse.json()).resolves.toEqual({
      detail: "The mock API is unavailable.",
    });
    await expect(uncoveredResponse.json()).resolves.toEqual({
      detail: "The mock API is unavailable.",
    });
  });

  it("fails closed with a 501 for API routes without a handler", async () => {
    const response = await fetch(
      "http://localhost:3003/api/mock-uncovered-route",
      { method: "POST" },
    );

    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toEqual({
      detail: "Missing mock API handler for POST /api/mock-uncovered-route",
    });
  });

  it("resolves covered routes ahead of the fail-closed guard", async () => {
    const response = await fetch("http://localhost:3003/api/auth/me");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "mock-user",
      email: "mock.patient@glycemicgpt.local",
      glucose_unit: "mgdl",
    });
  });

  it("returns the caregiver account and linked patient data in caregiver view", async () => {
    const { setMockRuntimeState } = await import("./state");
    setMockRuntimeState({ userRole: "caregiver" });

    const userResponse = await fetch("http://localhost:3003/api/auth/me");
    const patientsResponse = await fetch(
      "http://localhost:3003/api/caregivers/patients",
    );
    const statusResponse = await fetch(
      "http://localhost:3003/api/caregivers/patients/mock-patient/status",
    );

    expect(userResponse.status).toBe(200);
    await expect(userResponse.json()).resolves.toMatchObject({
      id: "mock-caregiver",
      email: "mock.caregiver@glycemicgpt.local",
      role: "caregiver",
    });
    await expect(patientsResponse.json()).resolves.toMatchObject({
      count: 1,
      patients: [expect.objectContaining({ patient_id: "mock-patient" })],
    });
    await expect(statusResponse.json()).resolves.toMatchObject({
      patient_id: "mock-patient",
      glucose: expect.objectContaining({ is_stale: false }),
      iob: expect.objectContaining({ current_iob: 1.7 }),
    });
  });

  it("persists mocked glucose unit changes to the current user response", async () => {
    const updateResponse = await fetch(
      "http://localhost:3003/api/settings/glucose-unit",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ glucose_unit: "mmol" }),
      },
    );

    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toEqual({
      glucose_unit: "mmol",
    });

    const settingsResponse = await fetch(
      "http://localhost:3003/api/settings/glucose-unit",
    );
    await expect(settingsResponse.json()).resolves.toEqual({
      glucose_unit: "mmol",
    });

    const userResponse = await fetch("http://localhost:3003/api/auth/me");
    await expect(userResponse.json()).resolves.toMatchObject({
      glucose_unit: "mmol",
    });

    const caregiverStatusResponse = await fetch(
      "http://localhost:3003/api/caregivers/patients/mock-patient/status",
    );
    await expect(caregiverStatusResponse.json()).resolves.toMatchObject({
      glucose_unit: "mmol",
    });
  });

  it("persists mocked display name changes to the current user response", async () => {
    const updateResponse = await fetch(
      "http://localhost:3003/api/auth/profile",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: "Mechabeetus" }),
      },
    );

    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toMatchObject({
      display_name: "Mechabeetus",
    });

    const userResponse = await fetch("http://localhost:3003/api/auth/me");
    await expect(userResponse.json()).resolves.toMatchObject({
      display_name: "Mechabeetus",
    });
  });

  it("connects and disconnects CGM sources without replacing other connections", async () => {
    const { setMockRuntimeState } = await import("./state");
    setMockRuntimeState({ cgmSources: ["nightscout-loop"] });

    const connectResponse = await fetch(
      "http://localhost:3003/api/integrations/dexcom",
      { method: "POST" },
    );
    const sourcesResponse = await fetch(
      "http://localhost:3003/api/integrations/cgm",
    );

    expect(connectResponse.status).toBe(200);
    await expect(sourcesResponse.json()).resolves.toMatchObject({
      primary_source: "nightscout_loop",
      multiple_sources: true,
      sources: [
        expect.objectContaining({ source: "nightscout_loop", role: "primary" }),
        expect.objectContaining({ source: "dexcom_share", role: "secondary" }),
      ],
    });

    const disconnectResponse = await fetch(
      "http://localhost:3003/api/integrations/dexcom",
      { method: "DELETE" },
    );
    const remainingSourcesResponse = await fetch(
      "http://localhost:3003/api/integrations/cgm",
    );

    expect(disconnectResponse.status).toBe(204);
    await expect(remainingSourcesResponse.json()).resolves.toMatchObject({
      primary_source: "nightscout_loop",
      multiple_sources: false,
      sources: [
        expect.objectContaining({ source: "nightscout_loop", role: "primary" }),
      ],
    });
  });

  it("returns empty CGM responses after disconnecting the final source", async () => {
    const disconnectResponse = await fetch(
      "http://localhost:3003/api/integrations/dexcom",
      { method: "DELETE" },
    );
    const [sourcesResponse, historyResponse] = await Promise.all([
      fetch("http://localhost:3003/api/integrations/cgm"),
      fetch("http://localhost:3003/api/integrations/glucose/history"),
    ]);

    expect(disconnectResponse.status).toBe(204);
    await expect(sourcesResponse.json()).resolves.toEqual({
      sources: [],
      primary_source: null,
      multiple_sources: false,
    });
    await expect(historyResponse.json()).resolves.toEqual({
      readings: [],
      count: 0,
    });
  });

  it("serves a closed loop forecast through the public mock endpoint", async () => {
    const { setMockRuntimeState } = await import("./state");
    setMockRuntimeState({
      cgmSources: ["nightscout-trio"],
      pumpSources: ["trio-nightscout"],
    });

    const response = await fetch(
      "http://localhost:3003/api/integrations/forecast",
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      effective_source: "trio",
      available_sources: ["trio"],
      forecast: {
        source_engine: "trio",
        source_uploader: "Nightscout Trio",
        step_minutes: 5,
        horizon_minutes: 60,
        default_curve_name: "main",
      },
      forecast_unavailable_reason: null,
    });
    expect(Array.isArray(body.forecast.curves_mgdl.main)).toBe(true);
    expect(body.forecast.curves_mgdl.main).toHaveLength(13);
  });

  it("offers Loop when Tandem is selected before a Loop connection", async () => {
    const { setMockRuntimeState } = await import("./state");
    setMockRuntimeState({
      cgmSources: ["dexcom"],
      pumpSources: ["tandem", "loop-nightscout"],
    });

    const response = await fetch(
      "http://localhost:3003/api/integrations/forecast",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      source_preference: "auto",
      effective_source: "loop",
      available_sources: ["loop"],
      forecast: {
        source_engine: "loop",
      },
      forecast_unavailable_reason: null,
    });
  });

  it("persists a selected forecast source through the public mock endpoint", async () => {
    const { setMockRuntimeState } = await import("./state");
    setMockRuntimeState({
      cgmSources: ["dexcom"],
      pumpSources: ["loop-nightscout", "aaps-nightscout"],
    });

    const initialResponse = await fetch(
      "http://localhost:3003/api/integrations/forecast",
    );
    await expect(initialResponse.json()).resolves.toMatchObject({
      source_preference: "auto",
      effective_source: null,
      available_sources: ["aaps", "loop"],
      forecast_unavailable_reason: "needs_pick",
    });

    const updateResponse = await fetch(
      "http://localhost:3003/api/integrations/forecast/source",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "loop" }),
      },
    );
    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toEqual({
      source_preference: "loop",
    });

    const refreshedResponse = await fetch(
      "http://localhost:3003/api/integrations/forecast",
    );
    await expect(refreshedResponse.json()).resolves.toMatchObject({
      source_preference: "loop",
      effective_source: "loop",
      available_sources: ["aaps", "loop"],
      forecast: {
        source_engine: "loop",
      },
      forecast_unavailable_reason: null,
    });
  });

  it("returns the configured Tandem sync failure", async () => {
    const { setMockRuntimeState } = await import("./state");
    setMockRuntimeState({ tandemSyncShouldFail: true });

    const response = await fetch(
      "http://localhost:3003/api/integrations/tandem/sync",
      { method: "POST" },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      detail: "Unable to connect to Tandem. Please try again later.",
    });
  });

  it("reports the configured automatic Tandem sync failure", async () => {
    const { setMockRuntimeState } = await import("./state");
    setMockRuntimeState({ tandemAutomaticSyncShouldFail: true });

    const response = await fetch(
      "http://localhost:3003/api/integrations/tandem/sync/status",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      last_error:
        "Scheduled Tandem sync could not reach t:connect. Check your connection and try again.",
    });
  });

  it("persists Tandem automatic sync settings", async () => {
    const updateResponse = await fetch(
      "http://localhost:3003/api/integrations/tandem/sync/settings",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: false,
          sync_interval_minutes: 120,
        }),
      },
    );

    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toMatchObject({
      enabled: false,
      sync_interval_minutes: 120,
    });

    const statusResponse = await fetch(
      "http://localhost:3003/api/integrations/tandem/sync/status",
    );
    expect(statusResponse.status).toBe(200);
    await expect(statusResponse.json()).resolves.toMatchObject({
      enabled: false,
      sync_interval_minutes: 120,
    });
  });

  it("serves manual boluses and corrections from the mock review endpoint", async () => {
    const { setMockRuntimeState } = await import("./state");
    setMockRuntimeState({ pumpSources: ["tandem"], cgmBackfillDays: 2 });

    const response = await fetch(
      "http://localhost:3003/api/integrations/bolus/review?days=1&limit=20",
    );
    const body = (await response.json()) as {
      boluses: Array<{ event_type?: string; is_automated: boolean }>;
    };

    expect(response.status).toBe(200);
    expect(body.boluses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event_type: "bolus", is_automated: false }),
        expect.objectContaining({
          event_type: "correction",
          is_automated: true,
        }),
      ]),
    );
  });

  it("aggregates the same selected glucose range served to the trend chart", async () => {
    const { setMockRuntimeState } = await import("./state");
    setMockRuntimeState({ cgmBackfillDays: 30, glucoseEvent: "baseline" });

    const end = new Date();
    const start = new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000);
    const rangeParams = new URLSearchParams({
      start: start.toISOString(),
      end: end.toISOString(),
    });
    const historyParams = new URLSearchParams(rangeParams);
    historyParams.set("limit", "10000");

    const [historyResponse, statsResponse, timeInRangeResponse] =
      await Promise.all([
        fetch(
          `http://localhost:3003/api/integrations/glucose/history?${historyParams}`,
        ),
        fetch(
          `http://localhost:3003/api/integrations/glucose/stats?${rangeParams}`,
        ),
        fetch(
          `http://localhost:3003/api/integrations/glucose/time-in-range?${rangeParams}`,
        ),
      ]);
    const history = (await historyResponse.json()) as {
      count: number;
      readings: unknown[];
    };
    const stats = (await statsResponse.json()) as { readings_count: number };
    const timeInRange = (await timeInRangeResponse.json()) as {
      buckets: Array<{ readings: number }>;
      readings_count: number;
    };

    expect(historyResponse.status).toBe(200);
    expect(statsResponse.status).toBe(200);
    expect(timeInRangeResponse.status).toBe(200);
    expect(history.count).toBeGreaterThan(288);
    expect(history.readings).toHaveLength(history.count);
    expect(stats.readings_count).toBe(history.count);
    expect(timeInRange.readings_count).toBe(history.count);
    expect(
      timeInRange.buckets.reduce((total, bucket) => total + bucket.readings, 0),
    ).toBe(history.count);
  });

  it("describes API routes without explicit handlers", () => {
    const detail = getMissingMockApiHandlerDetail({
      method: "POST",
      url: "http://localhost/api/mock-uncovered-route",
    } as Request);

    expect(detail).toBe(
      "Missing mock API handler for POST /api/mock-uncovered-route",
    );
  });
});
