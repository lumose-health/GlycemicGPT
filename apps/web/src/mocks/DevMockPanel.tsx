"use client";

import { useEffect, useMemo, useState } from "react";

import { Checkbox } from "@/components/Checkbox";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Switch } from "@/components/Switch";
import { twMerge } from "@/lib/ui/twMerge";

import { MOCK_API_TESTS, runMockApiTest } from "./api-controls";
import type { MockApiTestDefinition } from "./api-controls.types";
import { startMockWorker } from "./browser";
import type {
  ConnectionTab,
  DevMockPanelProps,
  MockApiTestResults,
  MockControlTab,
} from "./DevMockPanel.types";
import {
  dispatchMockNotificationPreset,
  dispatchMockNotificationQueue,
  MOCK_NOTIFICATION_PRESETS,
  MOCK_NOTIFICATION_VARIANTS,
} from "./notification-controls";
import {
  getMockRuntimeState,
  setMockRuntimeState,
  subscribeToMockRuntimeState,
} from "./state";
import {
  DEFAULT_MOCK_RUNTIME_STATE,
  MOCK_AI_CHAT_OPTIONS,
  MOCK_CGM_BACKFILL_MAX_DAYS,
  MOCK_CGM_BACKFILL_MIN_DAYS,
  MOCK_CGM_OPTIONS,
  MOCK_GLUCOSE_EVENT_OPTIONS,
  MOCK_KNOWLEDGE_DOCUMENT_MAX_COUNT,
  MOCK_KNOWLEDGE_DOCUMENT_MIN_COUNT,
  MOCK_PUMP_OPTIONS,
  type MockAIChatScenario,
  type MockCgmSource,
  type MockGlucoseEvent,
  type MockPumpSource,
  type MockRuntimeState,
} from "./types";

function fieldClassName(className?: string): string {
  return twMerge(
    "font_poppins min-h-9 w-full rounded-button border border-border-default bg-surface-primary px-3 text-[0.875rem] leading-5 font-normal tracking-normal text-foreground-primary",
    "focus:outline-hidden focus-visible:ring-2 focus-visible:ring-border-active",
    className,
  );
}

function buttonClassName(className?: string): string {
  return twMerge(
    "font_poppins inline-flex min-h-9 cursor-pointer items-center justify-center rounded-button border border-border-default px-3 text-[0.75rem] leading-5 font-bold tracking-normal text-foreground-primary transition-colors",
    "hover:border-border-hover hover:bg-surface-secondary",
    "focus:outline-hidden focus-visible:ring-2 focus-visible:ring-border-active",
    className,
  );
}

function labelClassName(className?: string): string {
  return twMerge(
    "font_poppins text-[0.75rem] leading-5 font-bold tracking-normal",
    className,
  );
}

function captionClassName(className?: string): string {
  return twMerge(
    "font_poppins text-[0.75rem] leading-5 font-normal tracking-normal",
    className,
  );
}

function clampKnowledgeDocumentCount(count: number): number {
  if (!Number.isFinite(count)) {
    return MOCK_KNOWLEDGE_DOCUMENT_MIN_COUNT;
  }

  return Math.min(
    MOCK_KNOWLEDGE_DOCUMENT_MAX_COUNT,
    Math.max(MOCK_KNOWLEDGE_DOCUMENT_MIN_COUNT, Math.round(count)),
  );
}

export function DevMockPanel({ runtimeActive = false }: DevMockPanelProps) {
  const [draft, setDraft] = useState<MockRuntimeState>(
    DEFAULT_MOCK_RUNTIME_STATE,
  );
  const [isExpanded, setIsExpanded] = useState(false);
  const [controlTab, setControlTab] = useState<MockControlTab>("connections");
  const [connectionTab, setConnectionTab] = useState<ConnectionTab>("cgm");
  const [apiTestResults, setApiTestResults] = useState<MockApiTestResults>({});

  useEffect(() => {
    const current = getMockRuntimeState();
    const next = runtimeActive ? { ...current, enabled: true } : current;
    setDraft(next);
    setIsExpanded(next.enabled);
    return subscribeToMockRuntimeState((next) => {
      setDraft(next);
    });
  }, [runtimeActive]);

  const selectedGlucoseEvent = useMemo(
    () =>
      MOCK_GLUCOSE_EVENT_OPTIONS.find(
        (option) => option.value === draft.glucoseEvent,
      ),
    [draft.glucoseEvent],
  );
  const selectedAIChatScenario = useMemo(
    () =>
      MOCK_AI_CHAT_OPTIONS.find(
        (option) => option.value === draft.aiChatScenario,
      ),
    [draft.aiChatScenario],
  );

  const applyRuntimeState = (patch: Partial<MockRuntimeState>) => {
    const next = setMockRuntimeState({ ...patch, enabled: true });
    setDraft(next);
  };

  const triggerGlucoseEvent = (glucoseEvent: MockGlucoseEvent) => {
    applyRuntimeState({ glucoseEvent });
  };

  const selectAIChatScenario = (aiChatScenario: MockAIChatScenario) => {
    applyRuntimeState({ aiChatScenario });
  };

  const toggleCgmSource = (source: MockCgmSource, checked: boolean) => {
    const cgmSources = checked
      ? [...new Set([...draft.cgmSources, source])]
      : draft.cgmSources.filter((candidate) => candidate !== source);

    applyRuntimeState({ cgmSources });
  };

  const togglePumpSource = (source: MockPumpSource, checked: boolean) => {
    const pumpSources = checked
      ? [...new Set([...draft.pumpSources, source])]
      : draft.pumpSources.filter((candidate) => candidate !== source);
    applyRuntimeState({ pumpSources });
  };

  const executeApiTest = async (test: MockApiTestDefinition) => {
    setApiTestResults((current) => ({ ...current, [test.id]: "running" }));
    try {
      await startMockWorker();
      const result = await runMockApiTest(test);
      setApiTestResults((current) => ({ ...current, [test.id]: result }));
    } catch (error) {
      setApiTestResults((current) => ({
        ...current,
        [test.id]: {
          id: test.id,
          message: `FAIL ${
            error instanceof Error ? error.message : String(error)
          }`,
          passed: false,
          status: null,
        },
      }));
    }
  };

  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  return (
    <>
      {!isExpanded ? (
        <button
          type="button"
          className={twMerge(
            buttonClassName(),
            "fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 bg-surface-primary shadow-lg lg:bottom-4",
          )}
          onClick={() => setIsExpanded(true)}
        >
          Mock data
        </button>
      ) : null}

      <div
        aria-hidden="true"
        className={twMerge(
          "fixed inset-0 z-40 bg-overlay-subtle transition-opacity duration-300 ease-out motion-reduce:transition-none",
          isExpanded ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        data-testid="mock-data-backdrop"
        onClick={() => setIsExpanded(false)}
      />

      <aside
        aria-hidden={!isExpanded}
        aria-label="Development mock data controls"
        className={twMerge(
          "font_poppins fixed inset-x-0 bottom-0 z-50 flex h-[50dvh] w-full transform-gpu flex-col rounded-t-panel border border-border-default border-x-0 border-b-0 bg-surface-primary shadow-xl transition-transform duration-300 ease-out motion-reduce:transition-none",
          isExpanded ? "translate-y-0" : "pointer-events-none translate-y-full",
        )}
        inert={!isExpanded}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border-default px-4 py-3 sm:px-6">
          <div>
            <h2
              className={labelClassName(
                "text-[0.875rem] text-foreground-primary",
              )}
            >
              Mock data
            </h2>
            <p className={captionClassName("mt-1 text-foreground-secondary")}>
              {runtimeActive ? "MSW active" : "MSW inactive"}
            </p>
            <Switch
              checked={draft.userRole === "caregiver"}
              containerClassName="mt-2"
              label="Caregiver view"
              onCheckedChange={(caregiverView) =>
                applyRuntimeState({
                  userRole: caregiverView ? "caregiver" : "diabetic",
                })
              }
            />
          </div>
          <button
            type="button"
            className={buttonClassName("min-h-8 px-2")}
            onClick={() => setIsExpanded(false)}
          >
            Close
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4 sm:px-6">
          <SegmentedControl
            aria-label="Mock control category"
            className="w-full sm:w-fit"
            onChange={setControlTab}
            options={[
              { value: "connections", label: "Connections" },
              { value: "glucose-event", label: "Glucose event" },
              { value: "knowledge-base", label: "Knowledge base" },
              { value: "ai-chat", label: "AI chat" },
              { value: "notifications", label: "Notifications" },
              { value: "api", label: "API" },
            ]}
            value={controlTab}
          />

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
            {controlTab === "connections" ? (
              <section
                aria-label="Connections"
                className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]"
                role="tabpanel"
              >
                <div className="min-h-0">
                  <SegmentedControl
                    aria-label="Connection type"
                    className="w-full sm:w-fit"
                    onChange={setConnectionTab}
                    options={[
                      {
                        value: "cgm",
                        label: "CGM connections",
                        meta: draft.cgmSources.length,
                      },
                      {
                        value: "pump",
                        label: "Insulin pump connections",
                        meta: draft.pumpSources.length,
                      },
                    ]}
                    value={connectionTab}
                  />

                  <div className="mt-3">
                    {connectionTab === "cgm" ? (
                      <fieldset
                        aria-label="CGM connections"
                        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
                        role="tabpanel"
                      >
                        {MOCK_CGM_OPTIONS.map((option) => {
                          const checked = draft.cgmSources.includes(
                            option.value,
                          );
                          return (
                            <Checkbox
                              key={option.value}
                              checked={checked}
                              label={
                                <span className="grid">
                                  <span
                                    className={labelClassName(
                                      "text-foreground-primary",
                                    )}
                                  >
                                    {option.label}
                                  </span>
                                  <span
                                    className={captionClassName(
                                      "text-foreground-secondary",
                                    )}
                                  >
                                    {option.description}
                                  </span>
                                </span>
                              }
                              onCheckedChange={(nextChecked) =>
                                toggleCgmSource(option.value, nextChecked)
                              }
                            />
                          );
                        })}
                        {draft.cgmSources.length === 0 ? (
                          <span
                            className={captionClassName(
                              "text-foreground-secondary",
                            )}
                          >
                            No CGM source connected
                          </span>
                        ) : null}
                      </fieldset>
                    ) : (
                      <fieldset
                        aria-label="Insulin pump connections"
                        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
                        role="tabpanel"
                      >
                        {MOCK_PUMP_OPTIONS.filter(
                          (option) => option.value !== "none",
                        ).map((option) => (
                          <Checkbox
                            key={option.value}
                            checked={draft.pumpSources.includes(option.value)}
                            label={
                              <span className="grid">
                                <span
                                  className={labelClassName(
                                    "text-foreground-primary",
                                  )}
                                >
                                  {option.label}
                                </span>
                                <span
                                  className={captionClassName(
                                    "text-foreground-secondary",
                                  )}
                                >
                                  {option.description}
                                </span>
                              </span>
                            }
                            onCheckedChange={(checked) =>
                              togglePumpSource(option.value, checked)
                            }
                          />
                        ))}
                        {draft.pumpSources.length === 0 ? (
                          <span
                            className={captionClassName(
                              "text-foreground-secondary",
                            )}
                          >
                            No insulin source connected
                          </span>
                        ) : null}
                      </fieldset>
                    )}
                  </div>
                </div>

                <div className="grid content-start gap-3 border-border-default lg:border-l lg:pl-4">
                  <div>
                    <h3 className={labelClassName("text-foreground-primary")}>
                      Data behavior
                    </h3>
                    <p
                      className={captionClassName(
                        "mt-1 text-foreground-secondary",
                      )}
                    >
                      Configure history depth and streaming behavior
                    </p>
                  </div>

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
                          applyRuntimeState({
                            cgmBackfillDays: draft.cgmBackfillDays,
                          })
                        }
                      >
                        Backfill days
                      </button>
                    </div>
                    <span
                      className={captionClassName("text-foreground-secondary")}
                    >
                      Up to {MOCK_CGM_BACKFILL_MAX_DAYS} days
                    </span>
                  </div>

                  <Checkbox
                    checked={draft.liveMode}
                    label="Live CGM stream"
                    labelClassName={labelClassName("text-foreground-primary")}
                    onCheckedChange={(liveMode) =>
                      applyRuntimeState({ liveMode })
                    }
                  />
                </div>
              </section>
            ) : null}

            {controlTab === "glucose-event" ? (
              <section
                aria-label="Glucose event"
                className="grid content-start gap-4"
                role="tabpanel"
              >
                <div>
                  <h3 className={labelClassName("text-foreground-primary")}>
                    Glucose event
                  </h3>
                  <p
                    className={captionClassName(
                      "mt-1 text-foreground-secondary",
                    )}
                  >
                    {selectedGlucoseEvent?.description}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {MOCK_GLUCOSE_EVENT_OPTIONS.map((option) => {
                    const selected = option.value === draft.glucoseEvent;
                    return (
                      <button
                        aria-pressed={selected}
                        className={buttonClassName(
                          selected
                            ? "min-w-40 bg-accent text-accent-foreground hover:bg-accent-hover"
                            : "min-w-40",
                        )}
                        key={option.value}
                        onClick={() => triggerGlucoseEvent(option.value)}
                        type="button"
                      >
                        {option.value === "baseline"
                          ? option.label
                          : `Trigger ${option.label.toLowerCase()}`}
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {controlTab === "notifications" ? (
              <section
                aria-label="Notifications"
                className="grid content-start gap-4"
                role="tabpanel"
              >
                <div>
                  <h3 className={labelClassName("text-foreground-primary")}>
                    Notifications
                  </h3>
                  <p
                    className={captionClassName(
                      "mt-1 text-foreground-secondary",
                    )}
                  >
                    Test V2 notification variants and queue behavior
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {MOCK_NOTIFICATION_VARIANTS.map((variant) => (
                    <button
                      key={variant}
                      type="button"
                      className={buttonClassName("min-w-40")}
                      onClick={() => dispatchMockNotificationPreset(variant)}
                    >
                      {MOCK_NOTIFICATION_PRESETS[variant].buttonLabel}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={buttonClassName("min-w-52")}
                    onClick={dispatchMockNotificationQueue}
                  >
                    Fill notification queue
                  </button>
                </div>
              </section>
            ) : null}

            {controlTab === "knowledge-base" ? (
              <section
                aria-label="Knowledge base"
                className="grid max-w-xl content-start gap-4"
                role="tabpanel"
              >
                <div>
                  <h3 className={labelClassName("text-foreground-primary")}>
                    Knowledge base
                  </h3>
                  <p
                    className={captionClassName(
                      "mt-1 text-foreground-secondary",
                    )}
                  >
                    Set the number of deterministic documents returned by the
                    mock API
                  </p>
                </div>
                <div className="grid gap-1">
                  <label
                    htmlFor="mock-knowledge-document-count"
                    className={labelClassName("text-foreground-secondary")}
                  >
                    Document count
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="mock-knowledge-document-count"
                      type="number"
                      min={MOCK_KNOWLEDGE_DOCUMENT_MIN_COUNT}
                      max={MOCK_KNOWLEDGE_DOCUMENT_MAX_COUNT}
                      className={fieldClassName("min-w-0 flex-1")}
                      value={draft.knowledgeDocumentCount}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          knowledgeDocumentCount: Number(event.target.value),
                        }))
                      }
                    />
                    <button
                      type="button"
                      className={buttonClassName("shrink-0 px-3")}
                      onClick={() =>
                        applyRuntimeState({
                          knowledgeDocumentCount: clampKnowledgeDocumentCount(
                            draft.knowledgeDocumentCount,
                          ),
                        })
                      }
                    >
                      Apply documents
                    </button>
                  </div>
                  <span
                    className={captionClassName("text-foreground-secondary")}
                  >
                    Use 21 or more documents to test pagination. Maximum{" "}
                    {MOCK_KNOWLEDGE_DOCUMENT_MAX_COUNT}.
                  </span>
                </div>
              </section>
            ) : null}

            {controlTab === "ai-chat" ? (
              <section
                aria-label="AI chat"
                className="grid content-start gap-4"
                role="tabpanel"
              >
                <div>
                  <h3 className={labelClassName("text-foreground-primary")}>
                    AI chat
                  </h3>
                  <p
                    className={captionClassName(
                      "mt-1 text-foreground-secondary",
                    )}
                  >
                    {selectedAIChatScenario?.description}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {MOCK_AI_CHAT_OPTIONS.map((option) => {
                    const selected = option.value === draft.aiChatScenario;
                    return (
                      <button
                        aria-pressed={selected}
                        className={buttonClassName(
                          selected
                            ? "min-w-40 bg-accent text-accent-foreground hover:bg-accent-hover"
                            : "min-w-40",
                        )}
                        key={option.value}
                        onClick={() => selectAIChatScenario(option.value)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {controlTab === "api" ? (
              <section
                aria-label="API"
                className="grid gap-4 lg:grid-cols-[minmax(18rem,1fr)_minmax(0,2fr)]"
                role="tabpanel"
              >
                <div className="grid content-start gap-3">
                  <div>
                    <h3 className={labelClassName("text-foreground-primary")}>
                      API behavior
                    </h3>
                    <p
                      className={captionClassName(
                        "mt-1 text-foreground-secondary",
                      )}
                    >
                      Configure global and endpoint specific failures
                    </p>
                  </div>

                  <button
                    aria-pressed={draft.apiUnavailable}
                    className={buttonClassName(
                      draft.apiUnavailable
                        ? "border-signal-check-fill text-signal-check-text"
                        : "border-signal-error-fill text-signal-error-text",
                    )}
                    onClick={() =>
                      applyRuntimeState({
                        apiUnavailable: !draft.apiUnavailable,
                      })
                    }
                    type="button"
                  >
                    {draft.apiUnavailable
                      ? "Restore mock API"
                      : "Kill mock API"}
                  </button>
                  <p
                    className={captionClassName(
                      draft.apiUnavailable
                        ? "text-signal-error-text"
                        : "text-signal-check-text",
                    )}
                    role="status"
                  >
                    {draft.apiUnavailable
                      ? "Mock API offline. Every /api/* request returns 503."
                      : "Mock API available."}
                  </p>

                  <Checkbox
                    checked={draft.tandemSyncShouldFail}
                    label="Fail manual Tandem sync"
                    labelClassName={labelClassName("text-foreground-primary")}
                    onCheckedChange={(tandemSyncShouldFail) =>
                      applyRuntimeState({ tandemSyncShouldFail })
                    }
                  />

                  <Checkbox
                    checked={draft.bolusReviewIncludeUnknownEventType}
                    label="Include unrecognized bolus review event type"
                    labelClassName={labelClassName("text-foreground-primary")}
                    onCheckedChange={(bolusReviewIncludeUnknownEventType) =>
                      applyRuntimeState({
                        bolusReviewIncludeUnknownEventType,
                      })
                    }
                  />

                  <button
                    aria-pressed={draft.tandemAutomaticSyncShouldFail}
                    className={buttonClassName(
                      draft.tandemAutomaticSyncShouldFail
                        ? "border-signal-check-fill text-signal-check-text"
                        : "border-signal-error-fill text-signal-error-text",
                    )}
                    onClick={() =>
                      applyRuntimeState({
                        tandemAutomaticSyncShouldFail:
                          !draft.tandemAutomaticSyncShouldFail,
                      })
                    }
                    type="button"
                  >
                    {draft.tandemAutomaticSyncShouldFail
                      ? "Clear automatic pump sync failure"
                      : "Trigger automatic pump sync failure"}
                  </button>
                </div>

                <div className="grid content-start gap-3 border-border-default lg:border-l lg:pl-4">
                  <div>
                    <h3 className={labelClassName("text-foreground-primary")}>
                      Request tests
                    </h3>
                    <p
                      className={captionClassName(
                        "mt-1 text-foreground-secondary",
                      )}
                    >
                      Run real frontend requests through the active mock worker
                    </p>
                  </div>
                  <div className="grid gap-3 xl:grid-cols-2">
                    {MOCK_API_TESTS.map((test) => {
                      const result = apiTestResults[test.id];
                      const isRunning = result === "running";
                      return (
                        <article
                          className="grid gap-2 rounded-panel border border-border-default bg-surface-elevated p-3"
                          key={test.id}
                        >
                          <div>
                            <h4
                              className={labelClassName(
                                "text-foreground-primary",
                              )}
                            >
                              {test.label}
                            </h4>
                            <p
                              className={captionClassName(
                                "mt-1 text-foreground-secondary",
                              )}
                            >
                              {test.description}
                            </p>
                          </div>
                          <code className="font_metric_caption break-all text-foreground-secondary">
                            {test.requestInit?.method ?? "GET"} {test.path}
                          </code>
                          <button
                            aria-label={`Run ${test.label}`}
                            className={buttonClassName()}
                            disabled={isRunning}
                            onClick={() => void executeApiTest(test)}
                            type="button"
                          >
                            {isRunning ? "Running request" : "Run request"}
                          </button>
                          {result && result !== "running" ? (
                            <p
                              className={captionClassName(
                                result.passed
                                  ? "text-signal-check-text"
                                  : "text-signal-error-text",
                              )}
                              role="status"
                            >
                              {result.message}
                            </p>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </aside>
    </>
  );
}
