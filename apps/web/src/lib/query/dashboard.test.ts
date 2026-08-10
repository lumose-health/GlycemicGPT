import { QueryClient } from "@tanstack/react-query";

import {
  dashboardQueryKeys,
  invalidateDashboardResources,
  normalizeHistoryWindow,
  shouldRetryDashboardQuery,
} from "./dashboard";

describe("dashboard query foundation", () => {
  it("normalizes equivalent windows into stable keys", () => {
    const first = normalizeHistoryWindow({
      from: "2026-08-01T00:00:00Z",
      to: "2026-08-02T00:00:00Z",
    });
    const second = normalizeHistoryWindow({
      from: "2026-08-01T02:00:00+02:00",
      to: "2026-08-02T02:00:00+02:00",
    });

    expect(first).toEqual(second);
    expect(
      dashboardQueryKeys.detail("user-1", "glucose-history", {
        limit: 288,
        window: first,
      }),
    ).toEqual(
      dashboardQueryKeys.detail("user-1", "glucose-history", {
        limit: 288,
        window: second,
      }),
    );
  });

  it("keeps users and response inputs isolated", () => {
    const inputs = { limit: 288, minutes: 1440 };
    expect(
      dashboardQueryKeys.detail("user-1", "glucose-history", inputs),
    ).not.toEqual(
      dashboardQueryKeys.detail("user-2", "glucose-history", inputs),
    );
    expect(
      dashboardQueryKeys.detail("user-1", "glucose-history", inputs),
    ).not.toEqual(
      dashboardQueryKeys.detail("user-1", "glucose-history", {
        limit: 144,
        minutes: 1440,
      }),
    );
  });

  it("retries one transient failure but never a client error or cancellation", () => {
    expect(shouldRetryDashboardQuery(0, new Error("offline"))).toBe(true);
    expect(shouldRetryDashboardQuery(1, new Error("offline"))).toBe(false);
    expect(
      shouldRetryDashboardQuery(
        0,
        Object.assign(new Error("invalid"), { status: 400 }),
      ),
    ).toBe(false);
    expect(
      shouldRetryDashboardQuery(
        0,
        Object.assign(new Error("cancelled"), { name: "AbortError" }),
      ),
    ).toBe(false);
  });

  it("invalidates only selected resource families", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      dashboardQueryKeys.resource("user-1", "forecast"),
      { value: 1 },
    );
    queryClient.setQueryData(
      dashboardQueryKeys.resource("user-1", "glucose-history"),
      { value: 2 },
    );

    await invalidateDashboardResources(queryClient, "user-1", ["forecast"]);

    expect(
      queryClient.getQueryState(
        dashboardQueryKeys.resource("user-1", "forecast"),
      )?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(
        dashboardQueryKeys.resource("user-1", "glucose-history"),
      )?.isInvalidated,
    ).toBe(false);
  });
});
