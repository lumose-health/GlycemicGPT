/**
 * Shared MSW bootstrap for the mock-layer node tests (`handlers.test.ts`,
 * `fixtures.test.ts`).
 *
 * It exists so those suites exercise the SAME server: one `setupServer` over
 * the real `handlers` array, and one runtime-state reset between tests. A
 * second, hand-copied bootstrap drifts -- the cycle-1 fixture suite omitted the
 * `setMockRuntimeState` reset, so its requests ran against whatever state the
 * previous file left behind.
 *
 * Not a `*.test.ts` file, so jest treats it as a module rather than a suite.
 */
import type { SetupServer } from "msw/node";

import { DEFAULT_MOCK_RUNTIME_STATE, type MockRuntimeState } from "./types";

/** The state every mock-layer suite starts each test from: a diabetic user on
 * a working Dexcom + Tandem setup, in canonical mg/dL. */
export const MOCK_TEST_BASELINE_STATE: Partial<MockRuntimeState> = {
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
};

/**
 * A COMPLETE runtime state, not a patch: `setMockRuntimeState` merges its
 * argument onto whatever state the previous test left behind, so resetting
 * with only `MOCK_TEST_BASELINE_STATE` (a `Partial`) let fields it doesn't
 * mention -- `glucoseEvent`, `liveMode`, `cgmBackfillDays`, etc. -- leak
 * across tests. Spreading the full default first and the baseline overrides
 * second means every key is set explicitly, so this reset is a true
 * replacement regardless of merge semantics.
 */
const MOCK_TEST_STATE: MockRuntimeState = {
  ...DEFAULT_MOCK_RUNTIME_STATE,
  ...MOCK_TEST_BASELINE_STATE,
};

/**
 * Registers the jest lifecycle hooks that stand the mock API up for a suite,
 * and returns an accessor for the running server (call it inside a test, not at
 * module scope -- the server only exists after `beforeAll`).
 */
export function setupMockApiServer(): () => SetupServer {
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

  afterEach(() => {
    server.resetHandlers();
  });

  beforeEach(async () => {
    const { setMockRuntimeState } = await import("./state");
    setMockRuntimeState({ ...MOCK_TEST_STATE });
  });

  return () => server;
}
