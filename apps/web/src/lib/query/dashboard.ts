import type { QueryClient, QueryKey } from "@tanstack/react-query";

import type { HistoryWindow } from "@/lib/glucose/history-selection";

export const DASHBOARD_QUERY_GC_TIME = 5 * 60 * 1000;
export const DASHBOARD_HISTORICAL_STALE_TIME = 5 * 60 * 1000;
export const DASHBOARD_LIVE_STALE_TIME = 30 * 1000;
export const DASHBOARD_CONNECTION_POLL_INTERVAL = 30 * 1000;
export const DASHBOARD_SERVER_SOURCE = "server-primary";

export type DashboardResource =
  | "bolus-review"
  | "cgm-sources"
  | "forecast"
  | "glooko-status"
  | "glucose-history"
  | "glucose-range"
  | "glucose-stats"
  | "insulin-summary"
  | "integrations"
  | "medtronic-status"
  | "nightscout-connections"
  | "pump-events"
  | "pump-status"
  | "time-in-range";

export interface NormalizedHistoryWindow {
  from: string;
  to: string;
}

export function normalizeHistoryWindow(
  window?: HistoryWindow | null,
): NormalizedHistoryWindow | null {
  if (!window) return null;

  const fromMs = new Date(window.from).getTime();
  const toMs = new Date(window.to).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) {
    return null;
  }

  return {
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
  };
}

export const dashboardQueryKeys = {
  all: (userId: string) => ["dashboard", userId] as const,
  resource: (userId: string, resource: DashboardResource) =>
    [...dashboardQueryKeys.all(userId), resource] as const,
  detail: <TInputs extends Record<string, unknown>>(
    userId: string,
    resource: DashboardResource,
    inputs: TInputs,
  ) => [...dashboardQueryKeys.resource(userId, resource), inputs] as const,
};

export interface HttpStatusError extends Error {
  status?: number;
}

export function shouldRetryDashboardQuery(
  failureCount: number,
  error: HttpStatusError,
): boolean {
  if (failureCount >= 1 || error.name === "AbortError") return false;
  if (typeof error.status === "number" && error.status < 500) return false;
  return true;
}

export function invalidateDashboardResources(
  queryClient: QueryClient,
  userId: string,
  resources: readonly DashboardResource[],
): Promise<void> {
  return Promise.all(
    resources.map((resource) =>
      queryClient.invalidateQueries({
        queryKey: dashboardQueryKeys.resource(userId, resource),
      }),
    ),
  ).then(() => undefined);
}

export function removeDashboardQueries(
  queryClient: QueryClient,
  userId: string,
): void {
  queryClient.removeQueries({ queryKey: dashboardQueryKeys.all(userId) });
}

export function isDashboardQueryKey(queryKey: QueryKey): boolean {
  return queryKey[0] === "dashboard";
}
