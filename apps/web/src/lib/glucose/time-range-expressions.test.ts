import { resolveRawTimeRange } from "./time-range-expressions";

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
});
