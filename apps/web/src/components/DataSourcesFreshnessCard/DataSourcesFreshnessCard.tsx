"use client";
/**
 * Multi-source freshness card for the dashboard.
 *
 * Replaces the old single-row"Last Updated" card. Renders one row
 * per active data source (Nightscout connection, Dexcom integration,
 * Tandem integration) with its `last_synced_at` relative time + a
 * status pill colored by recency-vs-cadence.
 *
 * Color thresholds:
 * - Slate (Pending): never synced yet (NS `last_sync_status ==="never"`
 * or no `last_sync_at` for direct integrations).
 * - Green (Connected): within 2x sync interval. One missed tick is
 * tolerated -- the scheduler tick is 1-min granularity + jitter.
 * - Amber (Lagging): 2x to 5x interval, OR `rate_limited` / `network`.
 * - Red (Stale/Error): >5x interval, OR `auth_failed` / `unreachable` /
 * `error`.
 *
 * Direct integrations don't expose a per-source sync interval. Dexcom
 * becomes lagging after 5m, Tandem after 60m, and other direct sources
 * retain the default 15m threshold.
 *
 * Returns null when the user has no data sources configured -- no
 * orphan empty card on the dashboard.
 */
import { Icon } from "@/base";
import { twMerge } from "@/lib/ui/twMerge";
import type { IntegrationResponse, NightscoutSyncStatus } from "@/lib/api";
import type { DataSourcesFreshnessCardProps } from "./DataSourcesFreshnessCard.types";
type StaleBand = "pending" | "fresh" | "lagging" | "stale";
type DirectStatus = IntegrationResponse["status"];
type DirectRow = {
  key: string;
  label: string;
  band: StaleBand;
  relative: string;
  iso: string | null;
};
const BAND_COLORS: Record<StaleBand, string> = {
  pending: "text-foreground-primary bg-surface-secondary/50",
  fresh: "text-signal-check-text bg-signal-check-fill/10",
  lagging: "text-signal-warning-text bg-signal-warning-fill/10",
  stale: "text-signal-error-text bg-signal-error-fill/10",
};
const BAND_LABELS: Record<StaleBand, string> = {
  pending: "Pending",
  fresh: "Connected",
  lagging: "Lagging",
  stale: "Stale",
};
type DirectThresholds = {
  laggingAfterMinutes: number;
  staleAfterMinutes: number;
};
const DEFAULT_DIRECT_THRESHOLDS: DirectThresholds = {
  laggingAfterMinutes: 15,
  staleAfterMinutes: 60,
};
const DEXCOM_THRESHOLDS: DirectThresholds = {
  laggingAfterMinutes: 5,
  staleAfterMinutes: 60,
};
const TANDEM_THRESHOLDS: DirectThresholds = {
  laggingAfterMinutes: 60,
  staleAfterMinutes: 300,
};
function formatRelative(iso: string | null, now: number): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";
  const totalSeconds = Math.floor(Math.max(0, now - then) / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s ago`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
function nightscoutBand(
  status: NightscoutSyncStatus,
  lastSyncedIso: string | null,
  syncIntervalMinutes: number,
  now: number,
): StaleBand {
  if (status === "never") return "pending";
  if (
    status === "auth_failed" ||
    status === "unreachable" ||
    status === "error"
  ) {
    return "stale";
  }
  if (!lastSyncedIso) return "pending";
  const elapsedMin = (now - new Date(lastSyncedIso).getTime()) / 60_000;
  if (Number.isNaN(elapsedMin)) return "pending";
  if (status === "rate_limited" || status === "network") {
    // Network glitches -- amber regardless of recency.
    return "lagging";
  }
  if (elapsedMin > 5 * syncIntervalMinutes) return "stale";
  if (elapsedMin > 2 * syncIntervalMinutes) return "lagging";
  return "fresh";
}
function directBand(
  status: DirectStatus,
  lastSyncAt: string | null,
  now: number,
  thresholds: DirectThresholds = DEFAULT_DIRECT_THRESHOLDS,
): StaleBand {
  if (status === "error") return "stale";
  if (status === "pending" || !lastSyncAt) {
    return "pending";
  }
  const elapsedMin = (now - new Date(lastSyncAt).getTime()) / 60_000;
  if (Number.isNaN(elapsedMin)) return "pending";
  if (elapsedMin > thresholds.staleAfterMinutes) return "stale";
  if (elapsedMin > thresholds.laggingAfterMinutes) return "lagging";
  return "fresh";
}
function isDexcomPrimarySource(
  cgmSources: DataSourcesFreshnessCardProps["cgmSources"],
): boolean {
  const primarySource = cgmSources?.primary_source?.toLowerCase();
  if (!primarySource) return false;

  const source = cgmSources?.sources.find(
    (candidate) => candidate.source.toLowerCase() === primarySource,
  );
  const identity = source
    ? `${source.source} ${source.label}`.toLowerCase()
    : primarySource;

  return identity.includes("dexcom");
}
function StatusPill({ band }: { band: StaleBand }) {
  return (
    <span
      className={twMerge(
        "font_metric_caption rounded-panel px-2 py-0.5",
        BAND_COLORS[band],
      )}
    >
      {BAND_LABELS[band]}
    </span>
  );
}
const columnHeaderClassName =
  "border-b border-border-default pb-2 text-left font_metric_caption uppercase text-foreground-primary/80";
const updatedColumnClassName = "text-right";
export function DataSourcesFreshnessCard({
  cgmSources = null,
  cgmUpdatedAt = null,
  nightscoutConnections,
  dexcom,
  embedded = false,
  glooko = null,
  medtronic = null,
  tandem,
  now,
}: DataSourcesFreshnessCardProps) {
  // Only render NS connections that are active (the list endpoint
  // also returns deactivated rows for history -- those shouldn't
  // count as freshness sources).
  const activeNs = nightscoutConnections.filter((c) => c.is_active);
  const directRows: DirectRow[] = [];
  const addDirectRow = (
    key: string,
    label: string,
    status: DirectStatus,
    lastSyncAt: string | null,
    displayOverride?: Pick<DirectRow, "band" | "relative">,
    thresholds?: DirectThresholds,
  ) => {
    directRows.push({
      key,
      label,
      band:
        displayOverride?.band ??
        directBand(status, lastSyncAt, now, thresholds),
      relative: displayOverride?.relative ?? formatRelative(lastSyncAt, now),
      iso: lastSyncAt,
    });
  };
  if (dexcom && dexcom.status !== "disconnected") {
    addDirectRow(
      "dexcom",
      "Dexcom",
      dexcom.status,
      isDexcomPrimarySource(cgmSources)
        ? cgmUpdatedAt
        : dexcom.last_sync_at,
      undefined,
      DEXCOM_THRESHOLDS,
    );
  }
  if (tandem && tandem.status !== "disconnected") {
    addDirectRow(
      "tandem",
      "Tandem",
      tandem.status,
      tandem.last_sync_at,
      undefined,
      TANDEM_THRESHOLDS,
    );
  }
  if (
    glooko &&
    glooko.status !== "not_configured" &&
    glooko.status !== "disconnected"
  ) {
    addDirectRow(
      "glooko",
      "Glooko",
      glooko.status,
      glooko.last_sync_at ?? null,
    );
  }
  if (
    medtronic &&
    medtronic.status !== "not_configured" &&
    medtronic.status !== "disconnected"
  ) {
    const medtronicStatus: DirectStatus =
      medtronic.status === "connected" ||
      medtronic.status === "pending" ||
      medtronic.status === "error"
        ? medtronic.status
        : "pending";
    addDirectRow(
      "medtronic",
      "Medtronic",
      medtronicStatus,
      medtronic.last_sync_at ?? null,
    );
  }

  cgmSources?.sources
    .filter((source) => source.role !== "off")
    .filter((source) => {
      const identity = `${source.source} ${source.label}`.toLowerCase();
      return !["dexcom", "nightscout", "glooko"].some((knownSource) =>
        identity.includes(knownSource),
      );
    })
    .forEach((source) => {
      const updatedAt =
        source.source === cgmSources.primary_source ? cgmUpdatedAt : null;
      addDirectRow(
        `cgm-${source.source}`,
        source.label,
        "connected",
        updatedAt,
        updatedAt ? undefined : { band: "fresh", relative: "-" },
      );
    });
  const totalSources = directRows.length + activeNs.length;
  if (totalSources === 0) {
    // No configured sources -- don't render an orphan empty card.
    return null;
  }
  const Container = embedded ? "div" : "article";
  const secondaryTextClassName = embedded
    ? "text-foreground-primary"
    : "text-foreground-secondary";
  const renderStandaloneRows = () => (
    <ul role="list" className="space-y-2">
      {directRows.map((row) => (
        <li
          key={row.key}
          data-testid={`freshness-row-${row.key}`}
          className="flex items-center justify-between gap-3 font_body_3"
        >
          <span className="font_metric_label text-foreground-primary truncate">
            {row.label}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <StatusPill band={row.band} />
            <span
              className={twMerge("font_metric_caption", secondaryTextClassName)}
              title={row.iso ? new Date(row.iso).toLocaleString() : undefined}
            >
              {row.relative}
            </span>
          </div>
        </li>
      ))}
      {activeNs.map((conn) => {
        const band = nightscoutBand(
          conn.last_sync_status,
          conn.last_synced_at,
          conn.sync_interval_minutes,
          now,
        );
        return (
          <li
            key={conn.id}
            data-testid={`freshness-row-nightscout-${conn.id}`}
            className="flex items-center justify-between gap-3 font_body_3"
          >
            <span className="font_metric_label text-foreground-primary truncate">
              {conn.name}
              <span
                className={twMerge(
                  "ml-1 font_metric_caption font_body_3",
                  secondaryTextClassName,
                )}
              >
                (Nightscout)
              </span>
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <StatusPill band={band} />
              <span
                className={twMerge(
                  "font_metric_caption",
                  secondaryTextClassName,
                )}
                title={
                  conn.last_synced_at
                    ? new Date(conn.last_synced_at).toLocaleString()
                    : undefined
                }
              >
                {formatRelative(conn.last_synced_at, now)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
  const renderEmbeddedRows = () => (
    <table
      className="w-full table-fixed border-collapse"
      aria-label="Connections"
    >
      <colgroup>
        <col className="w-[45%] sm:w-1/2" />
        <col className="w-[7.25rem]" />
        <col />
      </colgroup>
      <thead>
        <tr>
          <th scope="col" className={columnHeaderClassName}>
            Device
          </th>
          <th scope="col" className={columnHeaderClassName}>
            Status
          </th>
          <th
            scope="col"
            className={twMerge(columnHeaderClassName, updatedColumnClassName)}
          >
            Updated
          </th>
        </tr>
      </thead>
      <tbody>
        {directRows.map((row) => (
          <tr key={row.key} data-testid={`freshness-row-${row.key}`}>
            <td className="py-1 pr-3 font_metric_label text-foreground-primary truncate">
              {row.label}
            </td>
            <td className="py-1 pr-3">
              <StatusPill band={row.band} />
            </td>
            <td
              className={twMerge(
                "py-1 font_metric_caption whitespace-nowrap",
                secondaryTextClassName,
                updatedColumnClassName,
              )}
              title={row.iso ? new Date(row.iso).toLocaleString() : undefined}
            >
              {row.relative}
            </td>
          </tr>
        ))}
        {activeNs.map((conn) => {
          const band = nightscoutBand(
            conn.last_sync_status,
            conn.last_synced_at,
            conn.sync_interval_minutes,
            now,
          );
          return (
            <tr
              key={conn.id}
              data-testid={`freshness-row-nightscout-${conn.id}`}
            >
              <td className="py-1 pr-3 font_metric_label text-foreground-primary truncate">
                {conn.name}
                <span
                  className={twMerge(
                    "ml-1 font_metric_caption font_body_3",
                    secondaryTextClassName,
                  )}
                >
                  (Nightscout)
                </span>
              </td>
              <td className="py-1 pr-3">
                <StatusPill band={band} />
              </td>
              <td
                className={twMerge(
                  "py-1 font_metric_caption whitespace-nowrap",
                  secondaryTextClassName,
                  updatedColumnClassName,
                )}
                title={
                  conn.last_synced_at
                    ? new Date(conn.last_synced_at).toLocaleString()
                    : undefined
                }
              >
                {formatRelative(conn.last_synced_at, now)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
  return (
    <Container
      className={twMerge(
        embedded
          ? "text-foreground-primary"
          : "bg-surface-primary rounded-panel p-6 border border-border-default",
      )}
      aria-label="Data sources"
    >
      {!embedded && (
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 bg-signal-check-fill/10 rounded-panel">
            <Icon
              decorative
              icon="database"
              className="h-5 w-5 text-signal-check-text"
            />
          </div>
          <h3 className="text-foreground-secondary font_body_3">
            Data Sources
          </h3>
        </div>
      )}
      {embedded ? renderEmbeddedRows() : renderStandaloneRows()}
    </Container>
  );
}
