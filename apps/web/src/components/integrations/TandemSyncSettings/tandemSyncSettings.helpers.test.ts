import {
  getImportDateRange,
  getImportHistorySelection,
  getTandemImportRange,
} from "./tandemSyncSettings.helpers";

describe("getImportDateRange", () => {
  it("builds an inclusive preset range and respects available history", () => {
    expect(
      getImportDateRange(
        "30",
        "2026-07-28T10:00:00.000Z",
        "2026-07-10T00:00:00.000Z",
      ),
    ).toEqual({
      start: "2026-07-10",
      end: "2026-07-28",
    });
  });

  it("maps dashboard presets to Tandem import ranges", () => {
    expect(getTandemImportRange("7d")).toBe("7");
    expect(getTandemImportRange("14d")).toBe("14");
    expect(getTandemImportRange("30d")).toBe("30");
    expect(getTandemImportRange("24h")).toBeNull();
  });

  it("builds a custom dashboard selection from the import dates", () => {
    expect(getImportHistorySelection("2026-07-01", "2026-07-28")).toEqual({
      kind: "custom",
      label: "2026-07-01 to 2026-07-28",
      raw: {
        from: "2026-07-01",
        to: "2026-07-28",
      },
      window: {
        from: "2026-07-01T00:00:00.000Z",
        to: "2026-07-28T23:59:59.000Z",
      },
    });
  });
});
