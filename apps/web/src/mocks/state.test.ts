import { getMockRuntimeState, setMockRuntimeState } from "./state";
import { MOCK_CGM_BACKFILL_MAX_DAYS, MOCK_PUMP_OPTIONS } from "./types";

describe("mock runtime state", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.pushState({}, "", "/dashboard");
  });

  it("defaults to the disabled state", () => {
    expect(getMockRuntimeState().enabled).toBe(false);
  });

  it("persists mock runtime state in local storage", () => {
    setMockRuntimeState({ enabled: true });

    expect(getMockRuntimeState().enabled).toBe(true);
  });

  it("persists and normalizes the mocked user role", () => {
    setMockRuntimeState({ userRole: "caregiver" });

    expect(getMockRuntimeState().userRole).toBe("caregiver");

    window.localStorage.setItem(
      "glycemicgpt:mock-runtime",
      JSON.stringify({ userRole: "invalid" }),
    );

    expect(getMockRuntimeState().userRole).toBe("diabetic");
  });

  it("persists the Tandem sync failure scenario", () => {
    setMockRuntimeState({ tandemSyncShouldFail: true });

    expect(getMockRuntimeState().tandemSyncShouldFail).toBe(true);
  });

  it("persists the Tandem automatic sync failure scenario", () => {
    setMockRuntimeState({ tandemAutomaticSyncShouldFail: true });

    expect(getMockRuntimeState().tandemAutomaticSyncShouldFail).toBe(true);
  });

  it("persists Tandem automatic sync settings", () => {
    setMockRuntimeState({
      tandemSyncEnabled: false,
      tandemSyncIntervalMinutes: 120,
    });

    expect(getMockRuntimeState()).toMatchObject({
      tandemSyncEnabled: false,
      tandemSyncIntervalMinutes: 120,
    });
  });

  it("persists the complete API outage scenario", () => {
    setMockRuntimeState({ apiUnavailable: true });

    expect(getMockRuntimeState().apiUnavailable).toBe(true);
  });

  it("persists the AI chat scenario", () => {
    setMockRuntimeState({ aiChatScenario: "provider-error" });

    expect(getMockRuntimeState().aiChatScenario).toBe("provider-error");
  });

  it("persists the mocked glucose unit in local storage", () => {
    setMockRuntimeState({ glucoseUnit: "mmol" });

    expect(getMockRuntimeState().glucoseUnit).toBe("mmol");
  });

  it("persists and normalizes the mocked display name in local storage", () => {
    setMockRuntimeState({ displayName: "  Mechabeetus  " });

    expect(getMockRuntimeState().displayName).toBe("Mechabeetus");
  });

  it("keeps MDI and CGM only as distinct insulin scenarios", () => {
    expect(MOCK_PUMP_OPTIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "none", label: "No pump" }),
        expect.objectContaining({ value: "mdi", label: "Insulin pens (MDI)" }),
      ]),
    );

    setMockRuntimeState({ pumpSources: ["mdi"] });

    expect(getMockRuntimeState().pumpSources).toEqual(["mdi"]);
  });

  it("persists multiple CGM and insulin connections", () => {
    setMockRuntimeState({
      cgmSources: ["dexcom", "nightscout-loop"],
      pumpSources: ["tandem", "loop-nightscout"],
    });

    expect(getMockRuntimeState()).toMatchObject({
      cgmSources: ["dexcom", "nightscout-loop"],
      pumpSources: ["tandem", "loop-nightscout"],
    });
  });

  it("persists and normalizes the forecast source preference", () => {
    setMockRuntimeState({ forecastSourcePreference: "loop" });

    expect(getMockRuntimeState().forecastSourcePreference).toBe("loop");

    window.localStorage.setItem(
      "glycemicgpt:mock-runtime",
      JSON.stringify({ forecastSourcePreference: "invalid" }),
    );

    expect(getMockRuntimeState().forecastSourcePreference).toBe("auto");
  });

  it("persists a scenario with no CGM connection", () => {
    setMockRuntimeState({ cgmSources: [] });

    expect(getMockRuntimeState().cgmSources).toEqual([]);
  });

  it("migrates legacy single source state", () => {
    window.localStorage.setItem(
      "glycemicgpt:mock-runtime",
      JSON.stringify({
        cgmSource: "glooko",
        pumpSource: "mdi",
      }),
    );

    expect(getMockRuntimeState()).toMatchObject({
      cgmSources: ["glooko"],
      pumpSources: ["mdi"],
    });
  });

  it("caps CGM backfill days at the supported maximum", () => {
    setMockRuntimeState({ cgmBackfillDays: MOCK_CGM_BACKFILL_MAX_DAYS + 1 });

    expect(getMockRuntimeState().cgmBackfillDays).toBe(
      MOCK_CGM_BACKFILL_MAX_DAYS,
    );
  });
});
