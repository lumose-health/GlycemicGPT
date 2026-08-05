import {
  formatOverrideRemaining,
  parseLoopState,
  prettySourceName,
} from "./closed-loop-status";

describe("closed loop status", () => {
  it("accepts only supported loop states", () => {
    expect(parseLoopState("looping")).toBe("looping");
    expect(parseLoopState("not_looping")).toBe("not_looping");
    expect(parseLoopState("failed")).toBe("failed");
    expect(parseLoopState("warming_up")).toBeNull();
    expect(parseLoopState("LOOPING")).toBeNull();
  });

  it("formats known automation source names without echoing unknown input", () => {
    expect(prettySourceName("loop")).toBe("Loop");
    expect(prettySourceName("aaps")).toBe("AAPS");
    expect(prettySourceName("trio")).toBe("Trio");
    expect(prettySourceName("oref0")).toBe("oref0");
    expect(prettySourceName("iaps")).toBe("iAPS");
    expect(prettySourceName("future-engine")).toBe("Closed loop");
    expect(prettySourceName("constructor")).toBe("Closed loop");
    expect(prettySourceName("toString")).toBe("Closed loop");
  });

  it("formats the remaining active mode duration", () => {
    const now = new Date("2026-07-04T10:00:00.000Z");

    expect(
      formatOverrideRemaining("2026-07-04T11:15:00.000Z", now),
    ).toBe("1h 15m");
    expect(formatOverrideRemaining(null, now)).toBeNull();
    expect(
      formatOverrideRemaining("2026-07-04T09:59:00.000Z", now),
    ).toBeNull();
  });
});
