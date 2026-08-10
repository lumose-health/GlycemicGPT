import {
  TANDEM_SYNC_INTERVAL_ERROR_MESSAGE,
  tandemSyncIntervalSchema,
} from "./tandemSyncSettings.schema";

describe("tandemSyncIntervalSchema", () => {
  it.each([
    ["15", 15],
    ["60", 60],
    ["1440", 1440],
  ])("accepts %s minutes", (value, expected) => {
    expect(tandemSyncIntervalSchema.parse(value)).toBe(expected);
  });

  it.each(["", "1", "14", "14.5", "1441", "not-a-number"])(
    "rejects %s with the shared interval message",
    (value) => {
      const result = tandemSyncIntervalSchema.safeParse(value);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          TANDEM_SYNC_INTERVAL_ERROR_MESSAGE,
        );
      }
    },
  );
});
