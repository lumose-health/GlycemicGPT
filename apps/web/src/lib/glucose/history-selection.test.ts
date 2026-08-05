import { getWindowDurationMs } from "./history-selection";

describe("history selection", () => {
  it("returns a finite nonnegative duration", () => {
    expect(
      getWindowDurationMs({
        from: "2026-08-05T10:00:00.000Z",
        to: "2026-08-05T12:00:00.000Z",
      }),
    ).toBe(2 * 60 * 60 * 1000);
    expect(
      getWindowDurationMs({
        from: "2026-08-05T12:00:00.000Z",
        to: "2026-08-05T10:00:00.000Z",
      }),
    ).toBe(0);
    expect(getWindowDurationMs({ from: "invalid", to: "invalid" })).toBe(0);
  });
});
