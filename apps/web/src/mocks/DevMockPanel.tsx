"use client";

import { useEffect, useMemo, useState } from "react";

import { twMerge } from "@/lib/ui/twMerge";

import { startMockWorker } from "./browser";
import {
  buildMockDataSnapshot,
  generateAndStoreMockDailyBrief,
} from "./data";
import {
  getMockRuntimeState,
  setMockRuntimeState,
  subscribeToMockRuntimeState,
} from "./state";
import {
  DEFAULT_MOCK_RUNTIME_STATE,
  MOCK_CGM_BACKFILL_MAX_DAYS,
  MOCK_CGM_BACKFILL_MIN_DAYS,
  MOCK_CGM_OPTIONS,
  MOCK_GLUCOSE_EVENT_OPTIONS,
  MOCK_PUMP_OPTIONS,
  type MockCgmSource,
  type MockGlucoseEvent,
  type MockPumpSource,
  type MockRuntimeState,
} from "./types";

interface DevMockPanelProps {
  runtimeActive?: boolean;
}

function fieldClassName(className?: string): string {
  return twMerge(
    "font_poppins min-h-9 w-full rounded-button border border-border-default bg-surface-primary px-3 text-[0.875rem] leading-5 font-normal tracking-normal text-foreground-primary",
    "focus:outline-hidden focus-visible:ring-2 focus-visible:ring-border-active",
    className
  );
}

function buttonClassName(className?: string): string {
  return twMerge(
    "font_poppins inline-flex min-h-9 cursor-pointer items-center justify-center rounded-button border border-border-default px-3 text-[0.75rem] leading-5 font-bold tracking-normal text-foreground-primary transition-colors",
    "hover:border-border-hover hover:bg-surface-secondary",
    "focus:outline-hidden focus-visible:ring-2 focus-visible:ring-border-active",
    className
  );
}

function labelClassName(className?: string): string {
  return twMerge(
    "font_poppins text-[0.75rem] leading-5 font-bold tracking-normal",
    className
  );
}

function captionClassName(className?: string): string {
  return twMerge(
    "font_poppins text-[0.75rem] leading-5 font-normal tracking-normal",
    className
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export function DevMockPanel({ runtimeActive = false }: DevMockPanelProps) {
  const [draft, setDraft] = useState<MockRuntimeState>(
    DEFAULT_MOCK_RUNTIME_STATE
  );
  const [isExpanded, setIsExpanded] = useState(false);
  const [briefStatus, setBriefStatus] = useState<string | null>(null);

  useEffect(() => {
    const current = getMockRuntimeState();
    const next = runtimeActive ? { ...current, enabled: true } : current;
    setDraft(next);
    setIsExpanded(next.enabled);
    return subscribeToMockRuntimeState((next) => {
      setDraft(next);
    });
  }, [runtimeActive]);

  const selectedCgm = useMemo(
    () => MOCK_CGM_OPTIONS.find((option) => option.value === draft.cgmSource),
    [draft.cgmSource]
  );
  const selectedPump = useMemo(
    () => MOCK_PUMP_OPTIONS.find((option) => option.value === draft.pumpSource),
    [draft.pumpSource]
  );
  const selectedGlucoseEvent = useMemo(
    () =>
      MOCK_GLUCOSE_EVENT_OPTIONS.find(
        (option) => option.value === draft.glucoseEvent
      ),
    [draft.glucoseEvent]
  );

  const applyRuntimeState = (patch: Partial<MockRuntimeState>) => {
    const next = setMockRuntimeState({ ...patch, enabled: true });
    setDraft(next);
  };

  const triggerGlucoseEvent = (glucoseEvent: MockGlucoseEvent) => {
    applyRuntimeState({ glucoseEvent });
  };

  const generateDailyBrief = async () => {
    setBriefStatus("Generating daily brief");
    try {
      await startMockWorker();
      const response = await fetch("/api/ai/briefs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours: 24 }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`HTTP ${response.status}${body ? `: ${body}` : ""}`);
      }

      await response.json().catch(() => null);
      setBriefStatus("Daily brief generated");
    } catch (primaryError) {
      try {
        const currentState = getMockRuntimeState();
        generateAndStoreMockDailyBrief(
          currentState,
          buildMockDataSnapshot(currentState),
          24
        );
        setBriefStatus("Daily brief generated locally");
      } catch (fallbackError) {
        setBriefStatus(
          `Daily brief failed: ${errorMessage(fallbackError || primaryError)}`
        );
      }
    }
  };

  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  if (!isExpanded) {
    return (
      <button
        type="button"
        className={twMerge(
          buttonClassName(),
          "fixed bottom-4 right-4 z-50 bg-surface-primary shadow-lg"
        )}
        onClick={() => setIsExpanded(true)}
      >
        Mock data
      </button>
    );
  }

  return (
    <aside
      className="font_poppins fixed bottom-4 right-4 z-50 max-h-[calc(100vh-32px)] w-[min(360px,calc(100vw-32px))] overflow-y-auto rounded-panel border border-border-default bg-surface-primary p-4 shadow-xl"
      aria-label="Development mock data controls"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className={labelClassName("text-[0.875rem] text-foreground-primary")}>
            Mock data
          </h2>
          <p className={captionClassName("mt-1 text-foreground-secondary")}>
            {runtimeActive ? "MSW active" : "MSW inactive"}
          </p>
        </div>
        <button
          type="button"
          className={buttonClassName("min-h-8 px-2")}
          onClick={() => setIsExpanded(false)}
        >
          Close
        </button>
      </div>

      <div className="mt-4 grid gap-3">
        <label className="grid gap-1">
          <span className={labelClassName("text-foreground-secondary")}>
            CGM connection
          </span>
          <select
            className={fieldClassName()}
            value={draft.cgmSource}
            onChange={(event) =>
              applyRuntimeState({
                cgmSource: event.target.value as MockCgmSource,
              })
            }
          >
            {MOCK_CGM_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className={captionClassName("text-foreground-secondary")}>
            {selectedCgm?.description}
          </span>
        </label>

        <label className="grid gap-1">
          <span className={labelClassName("text-foreground-secondary")}>
            Insulin delivery
          </span>
          <select
            className={fieldClassName()}
            value={draft.pumpSource}
            onChange={(event) =>
              applyRuntimeState({
                pumpSource: event.target.value as MockPumpSource,
              })
            }
          >
            {MOCK_PUMP_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className={captionClassName("text-foreground-secondary")}>
            {selectedPump?.description}
          </span>
        </label>

        <div className="grid gap-1">
          <label
            htmlFor="mock-cgm-backfill-days"
            className={labelClassName("text-foreground-secondary")}
          >
            CGM backfill days
          </label>
          <div className="flex gap-2">
            <input
              id="mock-cgm-backfill-days"
              type="number"
              min={MOCK_CGM_BACKFILL_MIN_DAYS}
              max={MOCK_CGM_BACKFILL_MAX_DAYS}
              className={fieldClassName("min-w-0 flex-1")}
              value={draft.cgmBackfillDays}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  cgmBackfillDays: Number(event.target.value),
                }))
              }
            />
            <button
              type="button"
              className={buttonClassName("shrink-0 px-2")}
              onClick={() =>
                applyRuntimeState({ cgmBackfillDays: draft.cgmBackfillDays })
              }
            >
              Backfill days
            </button>
          </div>
          <span className={captionClassName("text-foreground-secondary")}>
            Up to {MOCK_CGM_BACKFILL_MAX_DAYS} days
          </span>
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={draft.liveMode}
            onChange={(event) =>
              applyRuntimeState({ liveMode: event.target.checked })
            }
          />
          <span className={labelClassName("text-foreground-primary")}>
            Live CGM stream
          </span>
        </label>

        <div className="grid gap-2">
          <div>
            <span className={labelClassName("text-foreground-secondary")}>
              Glucose event
            </span>
            <p className={captionClassName("mt-1 text-foreground-secondary")}>
              {selectedGlucoseEvent?.description}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={buttonClassName()}
              onClick={() => triggerGlucoseEvent("baseline")}
            >
              Baseline
            </button>
            <button
              type="button"
              className={buttonClassName()}
              onClick={() => triggerGlucoseEvent("low")}
            >
              Trigger low
            </button>
            <button
              type="button"
              className={buttonClassName()}
              onClick={() => triggerGlucoseEvent("urgent-low")}
            >
              Trigger urgent low
            </button>
            <button
              type="button"
              className={buttonClassName()}
              onClick={() => triggerGlucoseEvent("high")}
            >
              Trigger high
            </button>
            <button
              type="button"
              className={buttonClassName("col-span-2")}
              onClick={() => triggerGlucoseEvent("urgent-high")}
            >
              Trigger urgent high
            </button>
          </div>
        </div>

        <div className="grid gap-1">
          <button
            type="button"
            className={buttonClassName()}
            onClick={generateDailyBrief}
          >
            Generate daily brief
          </button>
          {briefStatus ? (
            <span className={captionClassName("text-foreground-secondary")}>
              {briefStatus}
            </span>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
