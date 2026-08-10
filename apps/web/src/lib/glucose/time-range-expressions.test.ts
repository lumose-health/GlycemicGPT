import {
  resolveRawTimeRange,
  resolveTimeRangeInput,
  shiftTimeWindow,
  TIME_RANGE_SAFETY_CAP_DAYS,
  zoomOutTimeWindow,
} from "./time-range-expressions";

describe("resolveRawTimeRange", () => {
  it("rejects a zero length exact timestamp range", () => {
    expect(
      resolveRawTimeRange(
        {
          from: "2026-08-02T10:00:00.000Z",
          to: "2026-08-02T10:00:00.000Z",
        },
        { timeZone: "UTC" },
      ),
    ).toBeNull();
  });

  it("still expands the same calendar date into a full day", () => {
    expect(
      resolveRawTimeRange(
        { from: "2026-08-02", to: "2026-08-02" },
        { timeZone: "UTC" },
      ),
    ).toMatchObject({
      window: {
        from: "2026-08-02T00:00:00.000Z",
        to: "2026-08-02T23:59:59.999Z",
      },
    });
  });

  it.each([
    "2026-13-01",
    "2026-04-31",
    "2026-02-29",
    "2026-01-01 24:00",
    "2026-01-01 12:60",
  ])("rejects the impossible local date or time %s", (value) => {
    expect(resolveTimeRangeInput(value, { timeZone: "UTC" })).toBeNull();
  });

  it("accepts a valid leap day", () => {
    expect(
      resolveTimeRangeInput("2028-02-29", { timeZone: "UTC" }),
    ).toBe("2028-02-29T00:00:00.000Z");
  });

  it("fails closed for invalid or reversed shifted windows", () => {
    expect(
      shiftTimeWindow({ from: "invalid", to: "also-invalid" }, 1),
    ).toBeNull();
    expect(
      zoomOutTimeWindow({
        from: "2026-08-03T00:00:00.000Z",
        to: "2026-08-02T00:00:00.000Z",
      }),
    ).toBeNull();
  });

  it("bounds shifted and repeatedly zoomed windows to the safety cap", () => {
    const oversized = shiftTimeWindow(
      {
        from: "2020-01-01T00:00:00.000Z",
        to: "2030-01-01T00:00:00.000Z",
      },
      1,
    );
    expect(oversized).not.toBeNull();

    const capMs = TIME_RANGE_SAFETY_CAP_DAYS * 86_400_000;
    expect(
      new Date(oversized!.to).getTime() - new Date(oversized!.from).getTime(),
    ).toBe(capMs);

    let window = {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-02T00:00:00.000Z",
    };
    for (let index = 0; index < 40; index += 1) {
      const next = zoomOutTimeWindow(window);
      expect(next).not.toBeNull();
      window = next!;
    }

    expect(
      new Date(window.to).getTime() - new Date(window.from).getTime(),
    ).toBe(capMs);
  });
});
