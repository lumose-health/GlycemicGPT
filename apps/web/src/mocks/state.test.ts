import {
  getMockRuntimeState,
  setMockRuntimeState,
} from "./state";
import { MOCK_CGM_BACKFILL_MAX_DAYS } from "./types";

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

  it("caps CGM backfill days at the supported maximum", () => {
    setMockRuntimeState({ cgmBackfillDays: MOCK_CGM_BACKFILL_MAX_DAYS + 1 });

    expect(getMockRuntimeState().cgmBackfillDays).toBe(
      MOCK_CGM_BACKFILL_MAX_DAYS
    );
  });
});
