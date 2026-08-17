/**
 * @jest-environment node
 */
import { setupMockApiServer } from "./test-server";

setupMockApiServer();

describe("setupMockApiServer baseline reset", () => {
  it("lets a test mutate a key MOCK_TEST_BASELINE_STATE doesn't mention", async () => {
    const { setMockRuntimeState } = await import("./state");
    setMockRuntimeState({ glucoseEvent: "urgent-low" });

    const { getMockRuntimeState } = await import("./state");
    expect(getMockRuntimeState().glucoseEvent).toBe("urgent-low");
  });

  it("resets that key back to the default before the next test runs", async () => {
    const { getMockRuntimeState } = await import("./state");
    expect(getMockRuntimeState().glucoseEvent).toBe("baseline");
  });
});
