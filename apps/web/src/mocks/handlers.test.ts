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
  setMockRuntimeState({ glucoseUnit: "mgdl" });
});

describe("mock API handlers", () => {
  it("fails closed with a 501 for API routes without a handler", async () => {
    const response = await fetch(
      "http://localhost:3003/api/mock-uncovered-route",
      { method: "POST" }
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

  it("persists mocked glucose unit changes to the current user response", async () => {
    const updateResponse = await fetch(
      "http://localhost:3003/api/settings/glucose-unit",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ glucose_unit: "mmol" }),
      }
    );

    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toEqual({
      glucose_unit: "mmol",
    });

    const settingsResponse = await fetch(
      "http://localhost:3003/api/settings/glucose-unit"
    );
    await expect(settingsResponse.json()).resolves.toEqual({
      glucose_unit: "mmol",
    });

    const userResponse = await fetch("http://localhost:3003/api/auth/me");
    await expect(userResponse.json()).resolves.toMatchObject({
      glucose_unit: "mmol",
    });

    const caregiverStatusResponse = await fetch(
      "http://localhost:3003/api/caregivers/patients/mock-patient/status"
    );
    await expect(caregiverStatusResponse.json()).resolves.toMatchObject({
      glucose_unit: "mmol",
    });
  });

  it("serves manual boluses and corrections from the mock review endpoint", async () => {
    const { setMockRuntimeState } = await import("./state");
    setMockRuntimeState({ pumpSource: "tandem", cgmBackfillDays: 2 });

    const response = await fetch(
      "http://localhost:3003/api/integrations/bolus/review?days=1&limit=20"
    );
    const body = await response.json() as {
      boluses: Array<{ event_type?: string; is_automated: boolean }>;
    };

    expect(response.status).toBe(200);
    expect(body.boluses).toEqual(expect.arrayContaining([
      expect.objectContaining({ event_type: "bolus", is_automated: false }),
      expect.objectContaining({ event_type: "correction", is_automated: true }),
    ]));
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
          `http://localhost:3003/api/integrations/glucose/history?${historyParams}`
        ),
        fetch(
          `http://localhost:3003/api/integrations/glucose/stats?${rangeParams}`
        ),
        fetch(
          `http://localhost:3003/api/integrations/glucose/time-in-range?${rangeParams}`
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
      timeInRange.buckets.reduce(
        (total, bucket) => total + bucket.readings,
        0
      )
    ).toBe(history.count);
  });

  it("describes API routes without explicit handlers", () => {
    const detail = getMissingMockApiHandlerDetail(
      {
        method: "POST",
        url: "http://localhost/api/mock-uncovered-route",
      } as Request
    );

    expect(detail).toBe(
      "Missing mock API handler for POST /api/mock-uncovered-route"
    );
  });
});
