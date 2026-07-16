import {
  getMockRuntimeState,
  setMockRuntimeState,
} from "./state";
import {
  MOCK_CGM_BACKFILL_MAX_DAYS,
  MOCK_PUMP_OPTIONS,
} from "./types";

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

  it("persists the mocked glucose unit in local storage", () => {
    setMockRuntimeState({ glucoseUnit: "mmol" });

    expect(getMockRuntimeState().glucoseUnit).toBe("mmol");
  });

  it("keeps MDI and CGM only as distinct insulin scenarios", () => {
    expect(MOCK_PUMP_OPTIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "none", label: "No pump" }),
        expect.objectContaining({ value: "mdi", label: "Insulin pens (MDI)" }),
      ])
    );

    setMockRuntimeState({ pumpSource: "mdi" });

    expect(getMockRuntimeState().pumpSource).toBe("mdi");
  });

  it("caps CGM backfill days at the supported maximum", () => {
    setMockRuntimeState({ cgmBackfillDays: MOCK_CGM_BACKFILL_MAX_DAYS + 1 });

    expect(getMockRuntimeState().cgmBackfillDays).toBe(
      MOCK_CGM_BACKFILL_MAX_DAYS
    );
  });
});
