"use client";

import {
  useState,
  type Dispatch,
  type FormEvent,
  type KeyboardEvent,
  type SetStateAction,
} from "react";
import Link from "next/link";
import { Button, Icon } from "@/base";
import { DestructiveButton } from "@/components/DestructiveButton";
import { FeedbackMessage } from "@/components/FeedbackMessage";
import { HighlightButton } from "@/components/HighlightButton";
import { PasswordTextInput } from "@/components/PasswordTextInput";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SelectField } from "@/components/SelectField";
import { StatusBadge } from "@/components/StatusBadge";
import { TextInput } from "@/components/TextInput";
import { twMerge } from "@/lib/ui/twMerge";
import { ConnectionSettingsAccordion } from "../ConnectionSettings";
import { ConnectionCollapsibleSection } from "../ConnectionSettings/ConnectionCollapsibleSection";
import type {
  NightscoutApiVersion,
  NightscoutAuthType,
  NightscoutSyncStatus,
} from "@/lib/api";
import { nightscoutConnectionSchema } from "./nightscoutConnectionSettings.schema";
import type { NightscoutConnectionSettingsProps } from "./NightscoutConnectionSettings.types";

// Preset cadences. Below 5 min offers diminishing returns (NS
// uploaders themselves typically push every 5 min); above 60 min is
// the territory of "low-priority backup connection." Power users who
// genuinely need a 7-min cadence can hit the API directly.
const SYNC_INTERVAL_PRESETS_MINUTES = [1, 5, 15, 30, 60] as const;

function formatInterval(minutes: number): string {
  return minutes < 60 ? `${minutes}m` : `${minutes / 60}h`;
}

const SYNC_STATUS_LABEL: Record<NightscoutSyncStatus, string> = {
  never: "Pending",
  ok: "Connected",
  error: "Error",
  auth_failed: "Auth Failed",
  rate_limited: "Rate Limited",
  network: "Network Error",
  unreachable: "Unreachable",
};

const SYNC_STATUS_VARIANT: Record<
  NightscoutSyncStatus,
  "error" | "neutral" | "success" | "warning"
> = {
  never: "neutral",
  ok: "success",
  error: "error",
  auth_failed: "error",
  rate_limited: "warning",
  network: "warning",
  unreachable: "error",
};

function SyncStatusBadge({ status }: { status: NightscoutSyncStatus }) {
  return (
    <StatusBadge className="ml-2" variant={SYNC_STATUS_VARIANT[status]}>
      {SYNC_STATUS_LABEL[status]}
    </StatusBadge>
  );
}

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";
  // floor not round so 59 minutes stays "59m ago" instead of jumping to "1h"
  const minutes = Math.floor((Date.now() - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NightscoutConnectionSettings({
  connections,
  embedded = false,
  isOffline,
  onCreate,
  onDelete,
  onTest,
  onSync,
  onUpdate,
}: NightscoutConnectionSettingsProps) {
  // The backend DELETE is a soft-delete that flips `is_active = false`
  // (preserves `source = "nightscout:<id>"` attribution on historical
  // pump_events). The list endpoint intentionally returns inactive
  // rows so the UI can group them. Until a dedicated "deactivated
  // history" affordance ships, we hide them entirely -- otherwise
  // clicking Delete appears to fail because the soft-deleted row
  // immediately re-appears on refetch.
  const activeConnections = connections.filter((c) => c.is_active);
  const latestSyncedAt = activeConnections.reduce<string | null>(
    (latest, connection) => {
      const current = connection.last_synced_at;
      if (!current) return latest;
      if (!latest) return current;
      return Date.parse(current) > Date.parse(latest) ? current : latest;
    },
    null,
  );
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [credential, setCredential] = useState("");
  const [authType, setAuthType] = useState<NightscoutAuthType>("auto");
  const [apiVersion, setApiVersion] = useState<NightscoutApiVersion>("auto");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createFieldErrors, setCreateFieldErrors] = useState<
    Partial<Record<"baseUrl" | "name", string>>
  >({});
  // Per-connection busy state. Sets (not single IDs) so two concurrent
  // actions on different connections don't clobber each other's spinners.
  const [testingIds, setTestingIds] = useState<Set<string>>(() => new Set());
  const [syncingIds, setSyncingIds] = useState<Set<string>>(() => new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(() => new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Optimistic override of `sync_interval_minutes` per connection.
  // Click reflects the chosen chip immediately; on PATCH success we
  // clear the override (parent will refetch with the canonical value);
  // on failure we clear the override + surface the error in the live
  // region. Map keyed by connection id so cross-row clicks don't race.
  const [intervalOverride, setIntervalOverride] = useState<
    Record<string, number>
  >({});

  // True when ANY action is in flight on this connection -- used to
  // disable the row's other action buttons too. Avoids "test while
  // syncing" or "delete while testing" foot-guns.
  const isBusy = (connectionId: string) =>
    testingIds.has(connectionId) ||
    syncingIds.has(connectionId) ||
    deletingIds.has(connectionId) ||
    updatingIds.has(connectionId);

  const addToSet =
    (setter: Dispatch<SetStateAction<Set<string>>>) => (id: string) =>
      setter((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
  const removeFromSet =
    (setter: Dispatch<SetStateAction<Set<string>>>) => (id: string) =>
      setter((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
  const [perConnectionResult, setPerConnectionResult] = useState<
    Record<string, { ok: boolean; message: string }>
  >({});

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (isCreating) return;
    setCreateError(null);
    const parsedFields = nightscoutConnectionSchema.safeParse({
      baseUrl,
      name,
    });
    if (!parsedFields.success) {
      const fieldErrors = parsedFields.error.flatten().fieldErrors;
      setCreateFieldErrors({
        baseUrl: fieldErrors.baseUrl?.[0],
        name: fieldErrors.name?.[0],
      });
      return;
    }
    setCreateFieldErrors({});
    setIsCreating(true);
    try {
      await onCreate({
        name: parsedFields.data.name,
        base_url: parsedFields.data.baseUrl,
        credential: credential.trim() || undefined,
        auth_type: authType,
        api_version: apiVersion,
      });
      setName("");
      setBaseUrl("");
      setCredential("");
      setAuthType("auto");
      setApiVersion("auto");
      setCreateFieldErrors({});
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create connection",
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleTest = async (connectionId: string) => {
    addToSet(setTestingIds)(connectionId);
    setPerConnectionResult((prev) => {
      const { [connectionId]: _drop, ...rest } = prev;
      return rest;
    });
    try {
      const result = await onTest(connectionId);
      setPerConnectionResult((prev) => ({
        ...prev,
        [connectionId]: {
          ok: result.ok,
          message: result.ok
            ? `Connected${result.server_version ? ` (Nightscout ${result.server_version})` : ""}`
            : result.error || "Connection test failed",
        },
      }));
    } catch (err) {
      setPerConnectionResult((prev) => ({
        ...prev,
        [connectionId]: {
          ok: false,
          message: err instanceof Error ? err.message : "Test failed",
        },
      }));
    } finally {
      removeFromSet(setTestingIds)(connectionId);
    }
  };

  const handleSync = async (connectionId: string) => {
    addToSet(setSyncingIds)(connectionId);
    setPerConnectionResult((prev) => {
      const { [connectionId]: _drop, ...rest } = prev;
      return rest;
    });
    try {
      const result = await onSync(connectionId);
      const inserted =
        result.entries_inserted +
        result.treatments_inserted_pump +
        result.treatments_inserted_glucose +
        result.devicestatuses_inserted;
      const failed =
        result.entries_failed +
        result.treatments_failed +
        result.devicestatuses_failed;
      const buildSuccess = () => {
        const parts = [
          inserted > 0
            ? `${inserted} new row${inserted === 1 ? "" : "s"}`
            : "already up to date",
        ];
        if (failed > 0) {
          parts.push(`${failed} record${failed === 1 ? "" : "s"} rejected`);
        }
        return `Synced — ${parts.join("; ")} (${result.duration_ms}ms)`;
      };
      setPerConnectionResult((prev) => ({
        ...prev,
        [connectionId]: {
          ok: result.status === "ok" && failed === 0,
          message:
            result.status === "ok"
              ? buildSuccess()
              : result.error || `Sync failed (${result.status})`,
        },
      }));
    } catch (err) {
      setPerConnectionResult((prev) => ({
        ...prev,
        [connectionId]: {
          ok: false,
          message: err instanceof Error ? err.message : "Sync failed",
        },
      }));
    } finally {
      removeFromSet(setSyncingIds)(connectionId);
    }
  };

  const handleDelete = async (connectionId: string) => {
    addToSet(setDeletingIds)(connectionId);
    try {
      await onDelete(connectionId);
      // Drop any in-memory test result for the deleted connection so the
      // entry doesn't leak in component state until unmount.
      setPerConnectionResult((prev) => {
        const { [connectionId]: _drop, ...rest } = prev;
        return rest;
      });
      setConfirmDeleteId(null);
    } catch (err) {
      // Surface the failure inline so the user knows the row did NOT
      // go away. The card stays visible (no refetch happened yet) and
      // the confirm dialog stays open so they can retry without
      // re-opening it.
      setPerConnectionResult((prev) => ({
        ...prev,
        [connectionId]: {
          ok: false,
          message:
            err instanceof Error ? err.message : "Failed to delete connection",
        },
      }));
    } finally {
      removeFromSet(setDeletingIds)(connectionId);
    }
  };

  const handleIntervalChange = async (
    connectionId: string,
    minutes: number,
  ) => {
    // Optimistic: reflect chosen chip immediately so the click feels
    // instant. Roll back if the PATCH fails.
    setIntervalOverride((prev) => ({ ...prev, [connectionId]: minutes }));
    addToSet(setUpdatingIds)(connectionId);
    setPerConnectionResult((prev) => {
      const { [connectionId]: _drop, ...rest } = prev;
      return rest;
    });
    try {
      await onUpdate(connectionId, { sync_interval_minutes: minutes });
      // Parent refetches the list; canonical interval will replace the
      // override on next render. Clear the override so the row falls
      // back to the server-sourced value.
      setIntervalOverride((prev) => {
        const { [connectionId]: _drop, ...rest } = prev;
        return rest;
      });
    } catch (err) {
      // Roll back the optimistic value.
      setIntervalOverride((prev) => {
        const { [connectionId]: _drop, ...rest } = prev;
        return rest;
      });
      setPerConnectionResult((prev) => ({
        ...prev,
        [connectionId]: {
          ok: false,
          message:
            err instanceof Error
              ? err.message
              : "Failed to update sync interval",
        },
      }));
    } finally {
      removeFromSet(setUpdatingIds)(connectionId);
    }
  };

  const handleIntervalKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    connectionId: string,
    currentIndex: number,
    currentMinutes: number,
    updating: boolean,
  ) => {
    if (isOffline || updating) return;

    let nextIndex: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (currentIndex + 1) % SYNC_INTERVAL_PRESETS_MINUTES.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex =
          (currentIndex - 1 + SYNC_INTERVAL_PRESETS_MINUTES.length) %
          SYNC_INTERVAL_PRESETS_MINUTES.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = SYNC_INTERVAL_PRESETS_MINUTES.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextMinutes = SYNC_INTERVAL_PRESETS_MINUTES[nextIndex];
    if (nextMinutes !== currentMinutes) {
      void handleIntervalChange(connectionId, nextMinutes);
    }

    const radios = event.currentTarget
      .closest('[role="radiogroup"]')
      ?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    radios?.[nextIndex]?.focus();
  };

  const sectionBody = (
    <div className="space-y-4">
      <p className="font_body_3 text-foreground-secondary">
        Nightscout is an independent open-source project, not a GlycemicGPT
        product. If you already self-host (or use a hosted) Nightscout instance,
        you can point GlycemicGPT at it to pull glucose readings, insulin
        events, and pump data. Multiple connections are supported (e.g. one per
        family member or per uploader).
      </p>

      {activeConnections.length > 0 && (
        <ul
          role="list"
          aria-label="Nightscout connections"
          className="space-y-3"
          data-testid="nightscout-connections-list"
        >
          {activeConnections.map((conn) => {
            const result = perConnectionResult[conn.id];
            const showConfirm = confirmDeleteId === conn.id;
            const currentInterval =
              intervalOverride[conn.id] ?? conn.sync_interval_minutes;
            const selectedIntervalIndex =
              SYNC_INTERVAL_PRESETS_MINUTES.findIndex(
                (minutes) => minutes === currentInterval,
              );
            const updating = updatingIds.has(conn.id);
            return (
              <li
                key={conn.id}
                data-testid={`nightscout-connection-${conn.id}`}
                className="rounded-panel bg-surface-secondary p-4"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Icon
                        decorative
                        icon="link"
                        className="h-4 w-4 shrink-0 text-foreground-primary"
                      />
                      <span className="font_body_2 truncate text-foreground-primary">
                        {conn.name}
                      </span>
                      <SyncStatusBadge status={conn.last_sync_status} />
                    </div>
                    <p className="font_body_4 mt-1 truncate text-foreground-primary">
                      {conn.base_url}
                    </p>
                    <div className="font_body_4 mt-1 flex flex-wrap gap-3 text-foreground-primary">
                      <span>
                        Last sync:{" "}
                        {conn.last_synced_at ? (
                          <time
                            dateTime={conn.last_synced_at}
                            title={new Date(
                              conn.last_synced_at,
                            ).toLocaleString()}
                          >
                            {formatRelative(conn.last_synced_at)}
                          </time>
                        ) : (
                          "never"
                        )}
                      </span>
                      <span>
                        {conn.api_version === "auto"
                          ? "Auto API"
                          : `API ${conn.api_version}`}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        className="font_metric_caption text-foreground-primary"
                        id={`ns-interval-label-${conn.id}`}
                      >
                        Sync every:
                      </span>
                      <div
                        role="radiogroup"
                        aria-labelledby={`ns-interval-label-${conn.id}`}
                        className="flex gap-1 flex-wrap"
                      >
                        {SYNC_INTERVAL_PRESETS_MINUTES.map((m, index) => {
                          const selected = currentInterval === m;
                          return (
                            <Button
                              key={m}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              tabIndex={
                                selectedIntervalIndex === -1
                                  ? index === 0
                                    ? 0
                                    : -1
                                  : selected
                                    ? 0
                                    : -1
                              }
                              onClick={() =>
                                !selected && handleIntervalChange(conn.id, m)
                              }
                              onKeyDown={(event) =>
                                handleIntervalKeyDown(
                                  event,
                                  conn.id,
                                  index,
                                  currentInterval,
                                  updating,
                                )
                              }
                              disabled={isOffline || updating}
                              data-testid={`nightscout-interval-${conn.id}-${m}`}
                              className={twMerge(
                                "font_metric_caption rounded-pill border px-2 py-0.5 transition-colors",
                                selected
                                  ? "border-accent bg-accent/20 text-foreground-primary"
                                  : "border-border-default bg-surface-primary text-foreground-secondary hover:border-border-hover hover:bg-surface-secondary hover:text-foreground-primary",
                                "disabled:cursor-not-allowed",
                                !selected && "disabled:opacity-50",
                              )}
                            >
                              {formatInterval(m)}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                    {conn.last_sync_error && (
                      <p
                        className="font_body_4 mt-1 text-signal-error-text"
                        role="status"
                      >
                        {conn.last_sync_error}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0 flex-wrap">
                    {(() => {
                      const reimportDisabled = isOffline || isBusy(conn.id);
                      return (
                        <Link
                          href={`/settings/integrations/nightscout/connect?connection=${encodeURIComponent(conn.id)}`}
                          data-testid={`nightscout-reimport-${conn.id}`}
                          aria-disabled={reimportDisabled}
                          // `aria-disabled` alone is advisory --
                          // the Link stays in tab order and
                          // Enter/Space still navigates. Pull
                          // it out of tab order AND block
                          // keyboard activation (Enter/Space)
                          // when disabled, so keyboard users
                          // get the same gate as mouse users.
                          tabIndex={reimportDisabled ? -1 : undefined}
                          onClick={(e) => {
                            if (reimportDisabled) {
                              e.preventDefault();
                            }
                          }}
                          onKeyDown={(e) => {
                            if (
                              reimportDisabled &&
                              (e.key === "Enter" || e.key === " ")
                            ) {
                              e.preventDefault();
                            }
                          }}
                          className={twMerge(
                            "font_metric_caption flex h-8 items-center gap-1 rounded-button border border-border-default bg-surface-primary px-3 text-foreground-primary transition-colors",
                            "hover:border-border-hover hover:bg-surface-secondary",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active",
                            reimportDisabled &&
                              "opacity-50 cursor-not-allowed pointer-events-none",
                          )}
                          title="Re-read this Nightscout's profile and pick which updated settings to bring into GlycemicGPT"
                        >
                          <Icon decorative icon="sync" className="h-3 w-3" />
                          Re-import
                        </Link>
                      );
                    })()}
                    <SecondaryButton
                      type="button"
                      onClick={() => handleSync(conn.id)}
                      disabled={isOffline || isBusy(conn.id)}
                      data-testid={`nightscout-sync-${conn.id}`}
                      size="md"
                    >
                      <Icon
                        decorative
                        icon="sync"
                        className={twMerge(
                          "h-3 w-3",
                          syncingIds.has(conn.id) && "animate-spin",
                        )}
                      />
                      Sync now
                    </SecondaryButton>
                    <SecondaryButton
                      type="button"
                      onClick={() => handleTest(conn.id)}
                      disabled={isOffline || isBusy(conn.id)}
                      data-testid={`nightscout-test-${conn.id}`}
                      size="md"
                    >
                      <Icon
                        decorative
                        icon={testingIds.has(conn.id) ? "sync" : "link"}
                        className={twMerge(
                          "h-3 w-3",
                          testingIds.has(conn.id) && "animate-spin",
                        )}
                      />
                      Test
                    </SecondaryButton>
                    <DestructiveButton
                      type="button"
                      onClick={() => setConfirmDeleteId(conn.id)}
                      disabled={isOffline || isBusy(conn.id)}
                      data-testid={`nightscout-delete-${conn.id}`}
                    >
                      <Icon
                        decorative
                        icon={
                          deletingIds.has(conn.id) ? "sync" : "circle-slash"
                        }
                        className={twMerge(
                          "h-3 w-3",
                          deletingIds.has(conn.id) && "animate-spin",
                        )}
                      />
                      Delete
                    </DestructiveButton>
                  </div>
                </div>

                {showConfirm && (
                  <div
                    role="alertdialog"
                    aria-label={`Confirm delete connection ${conn.name}`}
                    className="mt-3 rounded-panel border border-signal-error-text bg-surface-primary px-3 py-3"
                  >
                    <p className="font_body_3 mb-3 text-foreground-primary">
                      Delete <strong>{conn.name}</strong>? Historical data
                      already imported is preserved; only future syncs stop.
                    </p>
                    <div className="flex gap-2">
                      <DestructiveButton
                        type="button"
                        onClick={() => handleDelete(conn.id)}
                        disabled={deletingIds.has(conn.id)}
                        data-testid={`nightscout-confirm-delete-${conn.id}`}
                      >
                        {deletingIds.has(conn.id) ? (
                          <Icon
                            decorative
                            icon="sync"
                            className="h-3 w-3 animate-spin"
                          />
                        ) : null}
                        Delete connection
                      </DestructiveButton>
                      <SecondaryButton
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        disabled={deletingIds.has(conn.id)}
                      >
                        Cancel
                      </SecondaryButton>
                    </div>
                  </div>
                )}

                {/* Always-mounted live region so screen readers
                          register it before the first async insertion. */}
                <div
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                  className={twMerge(
                    result &&
                      "font_body_4 mt-3 flex items-center gap-2 rounded-panel px-3 py-2",
                    result?.ok &&
                      "bg-signal-check-fill/20 text-signal-check-text",
                    result &&
                      !result.ok &&
                      "bg-signal-error-fill/20 text-signal-error-text",
                  )}
                >
                  {result && (
                    <>
                      {result.ok ? (
                        <Icon
                          decorative
                          icon="check"
                          className="h-3 w-3 shrink-0"
                        />
                      ) : (
                        <Icon
                          decorative
                          icon="alert"
                          className="h-3 w-3 shrink-0"
                        />
                      )}
                      <span>{result.message}</span>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div
        className="flex items-start gap-3 rounded-panel border border-signal-info-fill bg-signal-info-fill/20 p-4"
        data-testid="nightscout-smart-onboarding-cta"
      >
        <div className="shrink-0 rounded-panel bg-signal-info-fill/20 p-2">
          <Icon
            decorative
            icon="lightbulb"
            className="h-5 w-5 text-signal-info-text"
          />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font_body_2 text-foreground-primary">
            Smart onboarding
          </h4>
          <p className="font_body_3 mt-1 text-foreground-primary">
            Walk through a 5-step wizard that reads your existing Nightscout
            profile and pre-fills your target range, ISF, carb ratio, basal
            schedule, and DIA.
          </p>
          <Link
            href="/settings/integrations/nightscout/connect"
            className={twMerge(
              "font_body_2 mt-3 inline-flex h-10 items-center gap-2 rounded-button bg-accent px-4 text-accent-foreground transition-colors",
              "hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active",
            )}
            data-testid="nightscout-smart-onboarding-link"
            prefetch={false}
          >
            <Icon decorative icon="lightbulb" className="h-4 w-4" />
            Start smart onboarding
          </Link>
        </div>
      </div>

      <details
        className="rounded-panel border border-border-default bg-surface-elevated"
        data-testid="nightscout-expert-mode"
      >
        <summary className="font_body_2 flex cursor-pointer list-none items-center justify-between px-4 py-3 text-foreground-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active">
          Expert mode (manual setup)
          <span className="font_metric_caption text-foreground-primary">
            Skip the wizard
          </span>
        </summary>
        <div className="border-t border-border-default p-4">
          <form
            onSubmit={handleCreate}
            aria-label="Add a Nightscout connection"
          >
            <h4 className="font_body_2 mb-3 text-foreground-primary">
              Add a Nightscout connection
            </h4>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextInput
                  disabled={isCreating}
                  errorMessage={createFieldErrors.name}
                  id="ns-name"
                  label="Name"
                  onChange={(event) => {
                    setName(event.target.value);
                    setCreateFieldErrors((errors) => ({
                      ...errors,
                      name: undefined,
                    }));
                  }}
                  placeholder="e.g. Home Loop, Spouse, ..."
                  type="text"
                  value={name}
                />
                <TextInput
                  autoComplete="off"
                  disabled={isCreating}
                  errorMessage={createFieldErrors.baseUrl}
                  id="ns-url"
                  label="Nightscout URL"
                  onChange={(event) => {
                    setBaseUrl(event.target.value);
                    setCreateFieldErrors((errors) => ({
                      ...errors,
                      baseUrl: undefined,
                    }));
                  }}
                  placeholder="https://my-ns.example.com"
                  type="url"
                  value={baseUrl}
                />
              </div>
              <PasswordTextInput
                autoComplete="off"
                data-1p-ignore=""
                data-lpignore="true"
                disabled={isCreating}
                helperText="Use the Nightscout API_SECRET or a bearer token. Leave blank for a public read-only instance."
                id="ns-credential"
                label="API_SECRET or bearer token"
                onChange={(event) => setCredential(event.target.value)}
                optionalText="Optional"
                spellCheck={false}
                value={credential}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SelectField
                  disabled={isCreating}
                  id="ns-auth-type"
                  label="Credential type"
                  onChange={(event) =>
                    setAuthType(event.target.value as NightscoutAuthType)
                  }
                  options={[
                    { label: "Auto-detect", value: "auto" },
                    { label: "API_SECRET", value: "secret" },
                    { label: "Bearer token", value: "token" },
                  ]}
                  value={authType}
                />
                <SelectField
                  disabled={isCreating}
                  id="ns-api-version"
                  label="Nightscout API version"
                  onChange={(event) =>
                    setApiVersion(event.target.value as NightscoutApiVersion)
                  }
                  options={[
                    { label: "Auto-detect", value: "auto" },
                    { label: "v1", value: "v1" },
                    { label: "v3", value: "v3" },
                  ]}
                  value={apiVersion}
                />
              </div>
              {createError ? (
                <FeedbackMessage message={createError} variant="error" />
              ) : null}
              <HighlightButton
                type="submit"
                disabled={isOffline || isCreating}
                className="w-full sm:w-auto"
              >
                <Icon
                  decorative
                  icon={isCreating ? "sync" : "link"}
                  className={twMerge("h-4 w-4", isCreating && "animate-spin")}
                />
                Connect Nightscout
              </HighlightButton>
            </div>
          </form>
        </div>
      </details>
    </div>
  );

  const section = (
    <ConnectionSettingsAccordion
      defaultOpen={false}
      icon="link"
      name="Nightscout"
      status={activeConnections.length > 0 ? "connected" : "disconnected"}
      statusLabel={
        activeConnections.length > 0
          ? `${activeConnections.length} Connection${activeConnections.length === 1 ? "" : "s"}`
          : undefined
      }
      updatedAt={latestSyncedAt}
    >
      {sectionBody}
    </ConnectionSettingsAccordion>
  );

  const content = <div className="space-y-4">{section}</div>;

  if (embedded) {
    return content;
  }

  return (
    <ConnectionCollapsibleSection
      iconName="link"
      title="Third-Party Integrations"
    >
      {content}
    </ConnectionCollapsibleSection>
  );
}
