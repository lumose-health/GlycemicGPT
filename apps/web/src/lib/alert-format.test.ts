import { formatCountdown, formatTimeAgo } from "./alert-format";

describe("alert time formatting", () => {
  beforeEach(() => {
    jest
      .spyOn(Date, "now")
      .mockReturnValue(new Date("2026-08-05T12:00:00.000Z").getTime());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns safe fallbacks for invalid timestamps", () => {
    expect(formatTimeAgo("invalid")).toBe("unknown");
    expect(formatCountdown("invalid")).toBeNull();
  });

  it("uses minute, hour, and day buckets", () => {
    expect(formatTimeAgo("2026-08-05T11:55:00.000Z")).toBe("5m ago");
    expect(formatTimeAgo("2026-08-05T10:00:00.000Z")).toBe("2h ago");
    expect(formatTimeAgo("2026-08-02T12:00:00.000Z")).toBe("3d ago");
  });

  it("formats a valid future countdown", () => {
    expect(formatCountdown("2026-08-05T12:01:05.000Z")).toBe("1:05");
  });
});
