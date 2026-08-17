import type { SetupWorker } from "msw/browser";

import { startMockWorker } from "./browser";

const mockHandlers = [{ info: { header: "mock handler" } }];
const mockStart = jest.fn().mockResolvedValue(undefined);
const mockResetHandlers = jest.fn();
const mockSetupWorker = jest.fn(
  (..._handlers: unknown[]) =>
    ({
      start: mockStart,
      resetHandlers: mockResetHandlers,
    }) as unknown as SetupWorker,
);

jest.mock("msw/browser", () => ({
  setupWorker: (...handlers: unknown[]) => mockSetupWorker(...handlers),
}));

jest.mock("./handlers", () => ({ handlers: mockHandlers }));

describe("mock browser worker", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeAll(() => {
    delete (
      globalThis as typeof globalThis & {
        __glycemicgptMockWorkerRuntime?: unknown;
      }
    ).__glycemicgptMockWorkerRuntime;
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "development",
      configurable: true,
    });
  });

  afterAll(() => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: originalNodeEnv,
      configurable: true,
    });
  });

  it("refreshes active handlers when the worker has already started", async () => {
    await startMockWorker();
    await startMockWorker();

    expect(mockSetupWorker).toHaveBeenCalledTimes(1);
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockResetHandlers).toHaveBeenCalledWith(...mockHandlers);
  });
});
