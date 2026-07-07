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
