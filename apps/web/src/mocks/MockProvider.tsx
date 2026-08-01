"use client";

import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";

import { startMockWorker } from "./browser";
import { DevMockPanel } from "./DevMockPanel";
import { getMockRuntimeState, subscribeToMockRuntimeState } from "./state";
import type { MockRuntimeState } from "./types";

interface MockProviderProps {
  children: ReactNode;
  initialShouldMock?: boolean;
}

function contentStateKey(state: MockRuntimeState): string {
  return JSON.stringify({
    enabled: state.enabled,
    apiUnavailable: state.apiUnavailable,
    aiChatScenario: state.aiChatScenario,
    cgmSources: state.cgmSources,
    pumpSources: state.pumpSources,
    cgmBackfillDays: state.cgmBackfillDays,
    liveMode: state.liveMode,
    glucoseEvent: state.glucoseEvent,
    glucoseUnit: state.glucoseUnit,
    tandemAutomaticSyncShouldFail: state.tandemAutomaticSyncShouldFail,
  });
}

export function MockProvider({
  children,
  initialShouldMock = false,
}: MockProviderProps) {
  const [shouldMock] = useState(initialShouldMock);
  const [isStarting, setIsStarting] = useState(shouldMock);
  const [hasStartError, setHasStartError] = useState(false);
  const [runtimeRevision, setRuntimeRevision] = useState(0);
  const contentStateKeyRef = useRef(contentStateKey(getMockRuntimeState()));

  useEffect(() => {
    if (!shouldMock) {
      return;
    }

    return subscribeToMockRuntimeState((state) => {
      const nextContentStateKey = contentStateKey(state);
      if (nextContentStateKey === contentStateKeyRef.current) {
        return;
      }

      contentStateKeyRef.current = nextContentStateKey;
      setRuntimeRevision((current) => current + 1);
    });
  }, [shouldMock]);

  useEffect(() => {
    if (!shouldMock) {
      return;
    }

    let cancelled = false;
    // startMockWorker is a no-op outside development and memoizes its own
    // start promise, so repeated mounts are safe and failed starts retry.
    startMockWorker()
      .catch((error) => {
        console.error("Failed to start mock runtime", error);
        if (!cancelled) {
          setHasStartError(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsStarting(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [shouldMock]);

  return (
    <>
      {isStarting ? (
        <div className="grid min-h-screen place-items-center bg-surface-page text-foreground-primary">
          <div className="rounded-panel border border-border-default bg-surface-primary p-4">
            <p className="font_metric_label">Starting mock data</p>
          </div>
        </div>
      ) : (
        <Fragment key={runtimeRevision}>{children}</Fragment>
      )}
      {shouldMock ? (
        <DevMockPanel runtimeActive={shouldMock && !hasStartError} />
      ) : null}
    </>
  );
}
