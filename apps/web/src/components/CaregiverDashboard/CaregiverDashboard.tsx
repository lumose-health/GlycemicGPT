"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Button, Icon } from "@/base";
import { EmptyState } from "@/components/EmptyState";
import { FeedbackMessage } from "@/components/FeedbackMessage";
import { LoadingState } from "@/components/LoadingState";
import { MarkdownContent } from "@/components/MarkdownContent";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { PrimaryButton } from "@/components/PrimaryButton";
import { StatusBadge } from "@/components/StatusBadge";
import { TextInput } from "@/components/TextInput";
import {
  getCaregiverPatientStatus,
  listLinkedPatients,
  sendCaregiverChat,
  type CaregiverChatResponse,
  type CaregiverPatientStatus,
  type LinkedPatient,
} from "@/lib/api";
import {
  formatGlucose,
  formatTrendRate,
  unitLabel,
  type GlucoseUnit,
} from "@/lib/glucose-units";
import { twMerge } from "@/lib/ui/twMerge";
import { useUserContext } from "@/providers/user-provider";
import { caregiverChatSchema } from "./caregiverChat.schema";
import type {
  CaregiverDashboardProps,
  PatientOverviewCardProps,
} from "./CaregiverDashboard.types";

const DEFAULT_REFRESH_INTERVAL_MS = 60_000;

function patientUnit(status: CaregiverPatientStatus | null): GlucoseUnit {
  return status?.glucose_unit ?? "mgdl";
}

function trendLabel(trend: string): string {
  const labels: Record<string, string> = {
    Falling: "Falling",
    FallingQuickly: "Falling quickly",
    Flat: "Steady",
    Rising: "Rising",
    RisingQuickly: "Rising quickly",
    SlightlyFalling: "Slightly falling",
    SlightlyRising: "Slightly rising",
  };
  return labels[trend] ?? "Trend unavailable";
}

function glucoseTextClass(value: number): string {
  if (value < 70 || value > 250) return "text-signal-error-text";
  if (value < 80 || value > 180) return "text-signal-warning-text";
  return "text-signal-check-text";
}

function glucoseDotClass(status: CaregiverPatientStatus | null): string {
  if (!status?.glucose || !status.permissions.can_view_glucose) {
    return "bg-foreground-disabled";
  }
  if (status.glucose.is_stale) return "bg-signal-warning-fill";
  const value = status.glucose.value;
  if (value < 55 || value > 250) return "bg-signal-error-fill";
  if (value < 70 || value > 180) return "bg-signal-warning-fill";
  return "bg-signal-check-fill";
}

function PatientOverviewCard({
  patient,
  status,
  onSelect,
}: PatientOverviewCardProps) {
  const glucose =
    status?.permissions.can_view_glucose && status.glucose
      ? status.glucose
      : null;
  const unit = patientUnit(status);

  return (
    <Button
      aria-label={`View details for ${patient.patient_email}`}
      className="group w-full rounded-panel border border-border-default bg-surface-primary p-5 text-left transition-colors hover:border-border-hover hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-border-active"
      onClick={() => onSelect(patient.patient_id)}
    >
      <span className="mb-3 flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className={twMerge(
            "h-2.5 w-2.5 shrink-0 rounded-pill",
            glucoseDotClass(status),
          )}
        />
        <span className="min-w-0 truncate font_body_2 text-foreground-primary">
          {patient.patient_email}
        </span>
      </span>
      {glucose ? (
        <span className="block space-y-1">
          <span className="flex items-baseline gap-2">
            <span
              className={twMerge(
                "font_ui_mono_value",
                glucoseTextClass(glucose.value),
              )}
            >
              {formatGlucose(glucose.value, unit)}
            </span>
            <span className="font_metric_caption text-foreground-secondary">
              {unitLabel(unit)}
            </span>
          </span>
          <span className="font_metric_caption block text-foreground-secondary">
            {trendLabel(glucose.trend)},{" "}
            {glucose.minutes_ago < 1
              ? "just now"
              : `${glucose.minutes_ago}m ago`}
            {glucose.is_stale ? ", stale" : ""}
          </span>
        </span>
      ) : (
        <span className="font_body_3 text-foreground-secondary">
          {status?.permissions.can_view_glucose === false
            ? "Glucose access not permitted"
            : "No glucose data"}
        </span>
      )}
      <span className="font_metric_caption mt-3 block text-foreground-secondary group-hover:text-foreground-primary">
        View details
      </span>
    </Button>
  );
}

export function CaregiverDashboard({
  refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
}: CaregiverDashboardProps) {
  const router = useRouter();
  const { user, isLoading: isUserLoading } = useUserContext();
  const [patients, setPatients] = useState<LinkedPatient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(
    null,
  );
  const [status, setStatus] = useState<CaregiverPatientStatus | null>(null);
  const [patientStatuses, setPatientStatuses] = useState(
    new Map<string, CaregiverPatientStatus>(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [chatMessage, setChatMessage] = useState("");
  const [chatResponse, setChatResponse] =
    useState<CaregiverChatResponse | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const selectedPatientIdRef = useRef<string | null>(null);
  const statusRequestIdRef = useRef(0);
  const chatRequestIdRef = useRef(0);

  const showOverview = patients.length > 1 && !selectedPatientId;

  const selectPatient = useCallback((patientId: string | null) => {
    selectedPatientIdRef.current = patientId;
    statusRequestIdRef.current += 1;
    chatRequestIdRef.current += 1;
    setSelectedPatientId(patientId);
    setStatus(null);
    setIsRefreshing(false);
    setChatMessage("");
    setChatResponse(null);
    setChatError(null);
    setIsChatLoading(false);
  }, []);

  useEffect(() => {
    if (!isUserLoading && user && user.role !== "caregiver") {
      router.replace("/dashboard");
    }
  }, [isUserLoading, router, user]);

  useEffect(() => {
    let cancelled = false;
    void listLinkedPatients()
      .then((data) => {
        if (cancelled) return;
        setPatients(data.patients);
        if (data.patients.length === 1) {
          selectPatient(data.patients[0].patient_id);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Failed to load patients",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectPatient]);

  const fetchStatus = useCallback(
    async (refreshing = false) => {
      if (!selectedPatientId) return;
      const patientId = selectedPatientId;
      const requestId = ++statusRequestIdRef.current;
      if (refreshing) setIsRefreshing(true);
      try {
        const nextStatus = await getCaregiverPatientStatus(patientId);
        if (
          requestId !== statusRequestIdRef.current ||
          selectedPatientIdRef.current !== patientId
        ) {
          return;
        }
        setStatus(nextStatus);
        setError(null);
        setLastRefresh(new Date());
      } catch (reason) {
        if (
          requestId !== statusRequestIdRef.current ||
          selectedPatientIdRef.current !== patientId
        ) {
          return;
        }
        setError(
          reason instanceof Error
            ? reason.message
            : "Failed to fetch patient status",
        );
      } finally {
        if (requestId === statusRequestIdRef.current) {
          setIsRefreshing(false);
        }
      }
    },
    [selectedPatientId],
  );

  const fetchAllStatuses = useCallback(
    async (refreshing = false) => {
      if (patients.length <= 1) return;
      if (refreshing) setIsRefreshing(true);
      const results = await Promise.allSettled(
        patients.map((patient) =>
          getCaregiverPatientStatus(patient.patient_id),
        ),
      );
      setPatientStatuses((current) => {
        const next = new Map(current);
        results.forEach((result, index) => {
          if (result.status === "fulfilled") {
            next.set(patients[index].patient_id, result.value);
          }
        });
        return next;
      });
      const failures = results.filter(
        (result) => result.status === "rejected",
      ).length;
      setError(
        failures
          ? `Failed to refresh ${failures} of ${patients.length} patients`
          : null,
      );
      setLastRefresh(new Date());
      setIsRefreshing(false);
    },
    [patients],
  );

  useEffect(() => {
    if (selectedPatientId) {
      void fetchStatus();
    }
  }, [fetchStatus, selectedPatientId]);

  useEffect(() => {
    if (patients.length > 1) void fetchAllStatuses();
  }, [fetchAllStatuses, patients.length]);

  useEffect(() => {
    if (!patients.length) return;
    const interval = window.setInterval(() => {
      if (selectedPatientId) void fetchStatus();
      else if (patients.length > 1) void fetchAllStatuses();
    }, refreshIntervalMs);
    return () => window.clearInterval(interval);
  }, [
    fetchAllStatuses,
    fetchStatus,
    patients.length,
    refreshIntervalMs,
    selectedPatientId,
  ]);

  async function handleChatSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selectedPatientId || isChatLoading) return;
    const parsed = caregiverChatSchema.safeParse({ message: chatMessage });
    if (!parsed.success) {
      setChatError(parsed.error.issues[0]?.message ?? "Enter a valid question");
      return;
    }
    const patientId = selectedPatientId;
    const requestId = ++chatRequestIdRef.current;
    setIsChatLoading(true);
    setChatError(null);
    try {
      const response = await sendCaregiverChat(patientId, parsed.data.message);
      if (
        requestId !== chatRequestIdRef.current ||
        selectedPatientIdRef.current !== patientId
      ) {
        return;
      }
      setChatResponse(response);
      setChatMessage("");
    } catch (reason) {
      if (
        requestId !== chatRequestIdRef.current ||
        selectedPatientIdRef.current !== patientId
      ) {
        return;
      }
      setChatError(
        reason instanceof Error ? reason.message : "Failed to get AI response",
      );
    } finally {
      if (requestId === chatRequestIdRef.current) {
        setIsChatLoading(false);
      }
    }
  }

  if (isLoading) {
    return <LoadingState label="Loading caregiver dashboard..." />;
  }

  if (!patients.length) {
    return (
      <div className="mx-auto max-w-5xl space-y-8">
        <PageHeader
          title="Caregiver Dashboard"
          description="Monitor patient glucose with their permission."
          icon="people"
        />
        <EmptyState
          title="No patients linked"
          description="Ask your patient to send an invitation from Care & Sharing settings."
        />
      </div>
    );
  }

  const unit = patientUnit(status);
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Caregiver Dashboard"
          description={
            showOverview
              ? `Monitoring ${patients.length} patients`
              : "Monitor patient glucose with their permission."
          }
          icon="people"
        />
        <div className="flex items-center gap-2">
          <StatusBadge variant="neutral">Read only</StatusBadge>
          <Button
            aria-label="Refresh data"
            className="rounded-button p-2 text-foreground-primary hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-border-active disabled:opacity-50"
            disabled={isRefreshing}
            onClick={() =>
              void (showOverview ? fetchAllStatuses(true) : fetchStatus(true))
            }
          >
            <Icon
              className={twMerge("h-5 w-5", isRefreshing && "animate-spin")}
              decorative
              icon="sync"
            />
          </Button>
        </div>
      </div>

      {error ? <FeedbackMessage message={error} variant="error" /> : null}

      {showOverview ? (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-live="polite"
        >
          {patients.map((patient) => (
            <PatientOverviewCard
              key={patient.patient_id}
              patient={patient}
              status={patientStatuses.get(patient.patient_id) ?? null}
              onSelect={selectPatient}
            />
          ))}
        </div>
      ) : !status ? (
        <LoadingState label="Loading patient details..." />
      ) : (
        <div className="space-y-6">
          {patients.length > 1 ? (
            <Button
              className="inline-flex items-center gap-2 rounded-button px-3 py-2 font_body_2 text-foreground-primary hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-border-active"
              onClick={() => {
                selectPatient(null);
              }}
            >
              <Icon className="h-4 w-4 rotate-180" decorative icon="chevron" />
              All patients
            </Button>
          ) : null}
          <p className="font_body_2 text-foreground-secondary">
            Viewing data for{" "}
            <span className="text-foreground-primary">
              {status.patient_email}
            </span>
          </p>
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel heading="Current Glucose">
              {status.permissions.can_view_glucose && status.glucose ? (
                <div className="space-y-2">
                  <p
                    className={twMerge(
                      "font_ui_mono_value",
                      glucoseTextClass(status.glucose.value),
                    )}
                  >
                    {formatGlucose(status.glucose.value, unit)}{" "}
                    <span className="font_metric_label text-foreground-secondary">
                      {unitLabel(unit)}
                    </span>
                  </p>
                  <p className="font_body_3 text-foreground-secondary">
                    {trendLabel(status.glucose.trend)},{" "}
                    {status.glucose.minutes_ago < 1
                      ? "just now"
                      : `${status.glucose.minutes_ago}m ago`}
                  </p>
                  {status.glucose.trend_rate !== null ? (
                    <p className="font_metric_caption text-foreground-secondary">
                      {formatTrendRate(status.glucose.trend_rate, unit)}{" "}
                      {unitLabel(unit)}/min
                    </p>
                  ) : null}
                  {status.glucose.is_stale ? (
                    <FeedbackMessage
                      message="Glucose data may be stale"
                      variant="warning"
                    />
                  ) : null}
                </div>
              ) : (
                <p className="font_body_3 text-foreground-secondary">
                  {status.permissions.can_view_glucose
                    ? "No glucose data available"
                    : "Glucose access not permitted"}
                </p>
              )}
            </Panel>
            <Panel heading="Insulin on Board">
              {status.permissions.can_view_iob && status.iob ? (
                <div className="space-y-2">
                  <p className="font_ui_mono_value text-foreground-primary">
                    {status.iob.current_iob.toFixed(2)}{" "}
                    <span className="font_metric_label text-foreground-secondary">
                      U
                    </span>
                  </p>
                  {status.iob.is_stale ? (
                    <FeedbackMessage
                      message="Insulin data may be stale"
                      variant="warning"
                    />
                  ) : null}
                </div>
              ) : (
                <p className="font_body_3 text-foreground-secondary">
                  {status.permissions.can_view_iob
                    ? "No insulin data available"
                    : "Insulin access not permitted"}
                </p>
              )}
            </Panel>
          </div>
          <Panel heading="Ask AI About Your Patient">
            {status.permissions.can_view_ai_suggestions ? (
              <div className="space-y-4">
                {chatResponse ? (
                  <div
                    className="rounded-panel bg-surface-secondary p-4 text-foreground-primary"
                    aria-live="polite"
                  >
                    <MarkdownContent content={chatResponse.response} />
                    <p className="font_metric_caption mt-3 text-foreground-primary">
                      {chatResponse.disclaimer}
                    </p>
                  </div>
                ) : null}
                <form
                  className="flex flex-col gap-3 sm:flex-row"
                  onSubmit={handleChatSubmit}
                >
                  <TextInput
                    label="Ask AI about your patient"
                    labelClassName="sr-only"
                    value={chatMessage}
                    onChange={(event) => setChatMessage(event.target.value)}
                    maxLength={2000}
                    disabled={isChatLoading}
                    errorMessage={chatError ?? undefined}
                    placeholder="How are they doing?"
                  />
                  <PrimaryButton
                    className="self-start"
                    disabled={isChatLoading || !chatMessage.trim()}
                    type="submit"
                  >
                    {isChatLoading ? "Sending..." : "Send"}
                  </PrimaryButton>
                </form>
              </div>
            ) : (
              <p className="font_body_3 text-foreground-secondary">
                AI suggestions not permitted
              </p>
            )}
          </Panel>
        </div>
      )}

      {lastRefresh ? (
        <p className="font_metric_caption text-center text-foreground-secondary">
          Last updated{" "}
          {lastRefresh.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      ) : null}
      <p className="font_metric_caption rounded-panel border border-border-default bg-surface-primary p-4 text-foreground-secondary">
        This read only view refreshes every 60 seconds. The patient controls
        access.
      </p>
    </div>
  );
}
