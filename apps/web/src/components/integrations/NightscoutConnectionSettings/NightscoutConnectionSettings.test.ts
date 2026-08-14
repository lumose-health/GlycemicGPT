import { createElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import type { NightscoutConnectionResponse } from "@/lib/api";
import { NightscoutConnectionSettings } from "./NightscoutConnectionSettings";
import { nightscoutConnectionSchema } from "./nightscoutConnectionSettings.schema";

const connection: NightscoutConnectionResponse = {
  api_version: "v3",
  auth_type: "token",
  base_url: "https://nightscout.example.com",
  created_at: "2026-07-01T00:00:00.000Z",
  detected_uploaders_json: {},
  has_credential: true,
  id: "nightscout-1",
  initial_sync_window_days: 30,
  is_active: true,
  last_evaluated_at: null,
  last_sync_error: null,
  last_sync_status: "ok",
  last_synced_at: null,
  name: "Home",
  sync_interval_minutes: 15,
  updated_at: "2026-07-01T00:00:00.000Z",
};

describe("Nightscout connection validation", () => {
  it("requires a name and valid URL", () => {
    expect(
      nightscoutConnectionSchema.safeParse({ baseUrl: "invalid", name: "Home" })
        .success,
    ).toBe(false);
    expect(
      nightscoutConnectionSchema.safeParse({
        baseUrl: "https://nightscout.example.com",
        name: " ",
      }).success,
    ).toBe(false);
    expect(
      nightscoutConnectionSchema.parse({
        baseUrl: " https://nightscout.example.com ",
        name: " Home ",
      }),
    ).toEqual({ baseUrl: "https://nightscout.example.com", name: "Home" });
  });

  it.each([
    ["ArrowRight", "30m", 30],
    ["ArrowDown", "30m", 30],
    ["ArrowLeft", "5m", 5],
    ["ArrowUp", "5m", 5],
    ["Home", "1m", 1],
    ["End", "1h", 60],
  ])(
    "moves and selects the sync interval with %s",
    (key, expectedLabel, expectedMinutes) => {
      const onUpdate = jest.fn(
        () => new Promise<never>(() => undefined),
      );
      render(
        createElement(NightscoutConnectionSettings, {
          connections: [connection],
          embedded: true,
          isOffline: false,
          onCreate: jest.fn(),
          onDelete: jest.fn(),
          onSync: jest.fn(),
          onTest: jest.fn(),
          onUpdate,
        }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Nightscout 1 Connection -" }),
      );

      const selected = screen.getByRole("radio", { name: "15m" });
      expect(selected).toBeEnabled();
      expect(selected).toHaveAttribute("tabindex", "0");
      selected.focus();

      fireEvent.keyDown(selected, { key });

      const next = screen.getByRole("radio", { name: expectedLabel });
      expect(next).toHaveFocus();
      expect(next).toHaveAttribute("aria-checked", "true");
      expect(onUpdate).toHaveBeenCalledWith("nightscout-1", {
        sync_interval_minutes: expectedMinutes,
      });
    },
  );
});
