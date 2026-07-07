/**
 * @jest-environment node
 */
import { getMissingMockApiHandlerDetail } from "./guard";

// msw's sse() requires an EventSource constructor at module load, which the
// Jest node environment does not provide.
if (!("EventSource" in globalThis)) {
  Object.defineProperty(globalThis, "EventSource", {
    value: class EventSource {},
    configurable: true,
  });
}

let handlers: (typeof import("./handlers"))["handlers"];

beforeAll(async () => {
  ({ handlers } = await import("./handlers"));
});

// Resolve a request the same way MSW does: the first handler whose predicate
// matches and whose resolver produces a response wins.
async function resolve(request: Request): Promise<Response | null> {
  for (const handler of handlers) {
    const result = await handler.run({
      request,
      requestId: "mock-handlers-test",
    });
    if (result?.response) {
      return result.response;
    }
  }
  return null;
}

describe("mock API handlers", () => {
  it("fails closed with a 501 for API routes without a handler", async () => {
    const response = await resolve(
      new Request("http://localhost:3003/api/mock-uncovered-route", {
        method: "POST",
      })
    );

    expect(response?.status).toBe(501);
    await expect(response?.json()).resolves.toEqual({
      detail: "Missing mock API handler for POST /api/mock-uncovered-route",
    });
  });

  it("resolves covered routes ahead of the fail-closed guard", async () => {
    const response = await resolve(
      new Request("http://localhost:3003/api/auth/me")
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
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
