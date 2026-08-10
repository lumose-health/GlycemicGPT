import {
  getPresetRawTimeRange,
  parseDashboardTimeRangeParams,
  serializeDashboardTimeRangeParams,
} from "./dashboard-time-range-url";

describe("dashboard time range URL", () => {
  it("round trips a preset through raw relative parameters", () => {
    const selection = { kind: "preset", range: "7d" } as const;
    const serialized = serializeDashboardTimeRangeParams(
      new URLSearchParams("view=compact"),
      selection,
    );
    const params = new URLSearchParams(serialized);

    expect(params.get("from")).toBe("now-168h");
    expect(params.get("to")).toBe("now");
    expect(params.get("timezone")).toBe("browser");
    expect(params.get("view")).toBe("compact");
    expect(parseDashboardTimeRangeParams(params, "Europe/Stockholm")).toEqual(
      selection,
    );
  });

  it("preserves absolute timestamps for a custom range", () => {
    const params = new URLSearchParams({
      from: "2026-08-04T12:15:08.087Z",
      to: "2026-08-05T12:15:08.087Z",
      timezone: "browser",
    });

    expect(
      parseDashboardTimeRangeParams(params, "Europe/Stockholm"),
    ).toMatchObject({
      kind: "custom",
      raw: {
        from: "2026-08-04T12:15:08.087Z",
        to: "2026-08-05T12:15:08.087Z",
      },
      window: {
        from: "2026-08-04T12:15:08.087Z",
        to: "2026-08-05T12:15:08.087Z",
      },
    });
  });

  it("rejects incomplete or unsupported URL ranges", () => {
    expect(
      parseDashboardTimeRangeParams(new URLSearchParams("from=now-24h"), "UTC"),
    ).toBeNull();
    expect(
      parseDashboardTimeRangeParams(
        new URLSearchParams("from=now-24h&to=now&timezone=Europe%2FStockholm"),
        "UTC",
      ),
    ).toBeNull();
  });

  it("uses hours for every preset URL", () => {
    expect(getPresetRawTimeRange("3d")).toEqual({
      from: "now-72h",
      to: "now",
    });
  });
});
