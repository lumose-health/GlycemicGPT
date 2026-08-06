"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/base/Button";
import { Icon } from "@/base/Icon";
import { Input } from "@/base/Input";
import { SecondaryButton } from "@/components/SecondaryButton";
import { twMerge } from "@/lib/ui/twMerge";
import {
  DASHBOARD_QUICK_RANGES,
  TIME_RANGE_SAFETY_CAP_DAYS,
  formatAbsoluteTimeInput,
  formatTimeRangeLabel,
  resolveRawTimeRange,
  shiftTimeWindow,
  zoomOutTimeWindow,
  type RawTimeRangeInput,
} from "@/lib/glucose/time-range-expressions";
import type {
  HistorySelection,
  HistoryWindow,
} from "@/lib/glucose/history-selection";
import { GLUCOSE_TIME_RANGES, type TimeRange } from "@/lib/glucose/time-ranges";
import {
  parseTimeRangeClipboardValue,
  serializeTimeRangeClipboardValue,
} from "@/lib/glucose/time-range-clipboard";
import type { DashboardTimeRangePickerProps } from "./DashboardTimeRangePicker.types";

interface CalendarDay {
  date: Date;
  inCurrentMonth: boolean;
}

const RECENT_STORAGE_KEY = "glycemicgpt-dashboard-time-range-recents";
const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const startOfDay = (date: Date): Date => {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  );
};

const calendarDateFromIso = (iso: string, timeZone: string): Date => {
  const [year, month, day] = formatAbsoluteTimeInput(iso, timeZone)
    .slice(0, 10)
    .split("-")
    .map(Number);

  return new Date(year, month - 1, day);
};

const formatCalendarDay = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const addMonths = (date: Date, amount: number): Date => {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
};

const compareDay = (a: Date, b: Date): number => {
  return startOfDay(a).getTime() - startOfDay(b).getTime();
};

const isSameDay = (a: Date | null, b: Date | null): boolean => {
  return Boolean(
    a &&
    b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate(),
  );
};

const createMonthDays = (month: Date): CalendarDay[] => {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstOfMonth = new Date(year, monthIndex, 1);
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
  const days: CalendarDay[] = [];

  for (let index = 0; index < 42; index += 1) {
    const dayOffset = index - firstWeekday;
    const date = new Date(year, monthIndex, 1 + dayOffset);
    days.push({
      date,
      inCurrentMonth: date.getMonth() === monthIndex,
    });
  }

  return days;
};

const labelForSelection = (
  selection: HistorySelection,
  timeZone: string,
): string => {
  if (selection.kind === "preset") {
    const preset = GLUCOSE_TIME_RANGES.find(
      (range) => range.key === selection.range,
    );
    return preset ? `Last ${preset.label}` : "Time range";
  }

  if (selection.label) {
    return selection.label;
  }

  return formatTimeRangeLabel(selection.window, timeZone);
};

const rawForSelection = (
  selection: HistorySelection,
  timeZone: string,
): RawTimeRangeInput => {
  if (selection.kind === "preset") {
    const preset = GLUCOSE_TIME_RANGES.find(
      (range) => range.key === selection.range,
    );
    return {
      from: `now-${preset?.hours ?? 72}h`,
      to: "now",
    };
  }

  if (selection.raw) {
    return selection.raw;
  }

  return {
    from: formatAbsoluteTimeInput(selection.window.from, timeZone),
    to: formatAbsoluteTimeInput(selection.window.to, timeZone),
  };
};

const readRecents = (): RawTimeRangeInput[] => {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (item): item is RawTimeRangeInput =>
          item && typeof item.from === "string" && typeof item.to === "string",
      )
      .slice(0, 5);
  } catch {
    return [];
  }
};

const writeRecent = (range: RawTimeRangeInput) => {
  try {
    const recents = readRecents();
    const next = [
      range,
      ...recents.filter(
        (recent) => recent.from !== range.from || recent.to !== range.to,
      ),
    ].slice(0, 5);
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    return;
  }
};

const toSelection = (
  raw: RawTimeRangeInput,
  timeZone: string,
  label?: string,
): Extract<HistorySelection, { kind: "custom" }> | null => {
  const resolved = resolveRawTimeRange(raw, { timeZone, display: label });
  if (!resolved || resolved.exceedsSafetyCap) {
    return null;
  }

  return {
    kind: "custom",
    window: resolved.window,
    raw,
    label: resolved.display,
  };
};

const windowEndsInFuture = (
  window: HistoryWindow,
  now = new Date(),
): boolean => {
  return new Date(window.to).getTime() > now.getTime();
};

const windowExceedsRangeLimit = (
  window: HistoryWindow,
  maxRangeDays: number,
): boolean => {
  return (
    new Date(window.to).getTime() - new Date(window.from).getTime() >
    maxRangeDays * 86_400_000
  );
};

export const DashboardTimeRangePicker = ({
  selection,
  currentWindow,
  timeZone,
  onChange,
  disabled = false,
  maxRangeDays = TIME_RANGE_SAFETY_CAP_DAYS,
  panelMode = "popover",
  presetOnly = false,
  presetRanges,
  quickRangeOptions,
  showNavigationControls = true,
  toolbarControls,
}: DashboardTimeRangePickerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [fromInput, setFromInput] = useState(
    () => rawForSelection(selection, timeZone).from,
  );
  const [toInput, setToInput] = useState(
    () => rawForSelection(selection, timeZone).to,
  );
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recents, setRecents] = useState<RawTimeRangeInput[]>([]);
  const [leftMonth, setLeftMonth] = useState(() => new Date());
  const [draftStart, setDraftStart] = useState<Date | null>(null);
  const [draftEnd, setDraftEnd] = useState<Date | null>(null);
  const [hoveredDate, setHoveredDate] = useState<Date | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const label = labelForSelection(selection, timeZone);
  const activePreset = selection.kind === "preset" ? selection.range : null;
  const nextForwardWindow = currentWindow
    ? shiftTimeWindow(currentWindow, 1)
    : null;
  const canMoveForward =
    !presetOnly &&
    showNavigationControls &&
    Boolean(nextForwardWindow && !windowEndsInFuture(nextForwardWindow));
  const availablePresetRanges = useMemo(
    () =>
      presetRanges
        ? GLUCOSE_TIME_RANGES.filter((range) =>
            presetRanges.includes(range.key),
          )
        : GLUCOSE_TIME_RANGES,
    [presetRanges],
  );

  const quickRanges = useMemo(() => {
    const now = new Date();
    return (quickRangeOptions ?? DASHBOARD_QUICK_RANGES)
      .map((option) => ({
        ...option,
        resolved: resolveRawTimeRange(option, {
          now,
          timeZone,
          display: option.display,
        }),
      }))
      .filter(
        (option) =>
          option.resolved &&
          !windowExceedsRangeLimit(option.resolved.window, maxRangeDays),
      );
  }, [maxRangeDays, quickRangeOptions, timeZone]);

  const filteredQuickRanges = quickRanges.filter(
    (option) =>
      option.display.toLowerCase().includes(search.trim().toLowerCase()) ||
      option.from.toLowerCase().includes(search.trim().toLowerCase()),
  );

  useEffect(() => {
    if (disabled) {
      setIsOpen(false);
    }
  }, [disabled]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const raw = rawForSelection(selection, timeZone);
    setFromInput(raw.from);
    setToInput(raw.to);
    setError(null);
    setRecents(readRecents());

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, selection, timeZone]);

  function applyRawRange(raw: RawTimeRangeInput, display?: string) {
    if (presetOnly) {
      return;
    }

    const resolved = resolveRawTimeRange(raw, { timeZone, display });

    if (!resolved) {
      setError(
        "Enter a date or relative time, for example now, now-1h, or 2026-04-17 08:00:00.",
      );
      return;
    }

    if (
      resolved.exceedsSafetyCap ||
      windowExceedsRangeLimit(resolved.window, maxRangeDays)
    ) {
      setError(`Time ranges are limited to ${maxRangeDays} days.`);
      return;
    }

    writeRecent(raw);
    setRecents(readRecents());
    onChange({
      kind: "custom",
      window: resolved.window,
      raw,
      label: resolved.display,
    });
    setIsOpen(false);
  }

  function applyPresetRange(range: TimeRange) {
    onChange({ kind: "preset", range });
    setIsOpen(false);
  }

  function applyWindow(window: HistoryWindow, display?: string) {
    if (presetOnly) {
      return;
    }

    const raw = {
      from: window.from,
      to: window.to,
    };
    const next = toSelection(raw, timeZone, display);
    if (next) {
      if (windowExceedsRangeLimit(next.window, maxRangeDays)) {
        setError(`Time ranges are limited to ${maxRangeDays} days.`);
        return;
      }

      writeRecent(raw);
      onChange(next);
    }
  }

  function moveWindow(direction: -1 | 1) {
    if (!currentWindow) {
      return;
    }

    const nextWindow = shiftTimeWindow(currentWindow, direction);
    if (!nextWindow) {
      return;
    }
    if (direction === 1 && windowEndsInFuture(nextWindow)) {
      return;
    }

    applyWindow(nextWindow, formatTimeRangeLabel(nextWindow, timeZone));
  }

  function zoomOut() {
    if (!currentWindow) {
      return;
    }

    const nextWindow = zoomOutTimeWindow(currentWindow);
    if (!nextWindow) {
      return;
    }
    applyWindow(nextWindow, formatTimeRangeLabel(nextWindow, timeZone));
  }

  function handleCalendarOpen() {
    const from = resolveRawTimeRange(
      { from: fromInput, to: toInput },
      { timeZone },
    )?.window.from;
    const to = resolveRawTimeRange(
      { from: fromInput, to: toInput },
      { timeZone },
    )?.window.to;
    const initialFrom = from
      ? calendarDateFromIso(from, timeZone)
      : calendarDateFromIso(new Date().toISOString(), timeZone);
    const initialTo = to ? calendarDateFromIso(to, timeZone) : initialFrom;
    setDraftStart(initialFrom);
    setDraftEnd(initialTo);
    setHoveredDate(null);
    setLeftMonth(
      new Date(initialFrom.getFullYear(), initialFrom.getMonth(), 1),
    );
  }

  function handleDayClick(day: Date) {
    const normalizedDay = startOfDay(day);

    if (!draftStart || (draftStart && draftEnd)) {
      setDraftStart(normalizedDay);
      setDraftEnd(null);
      setHoveredDate(null);
      return;
    }

    if (compareDay(normalizedDay, draftStart) < 0) {
      setDraftStart(normalizedDay);
      setDraftEnd(draftStart);
      setHoveredDate(null);
      return;
    }

    setDraftEnd(normalizedDay);
    setHoveredDate(null);
  }

  function applyCalendarRange() {
    if (!draftStart || !draftEnd) {
      return;
    }

    const from = formatCalendarDay(draftStart);
    const to = formatCalendarDay(draftEnd);
    setFromInput(from);
    setToInput(to);
    setDraftStart(null);
    setDraftEnd(null);
  }

  async function copyRange() {
    try {
      await navigator.clipboard.writeText(
        serializeTimeRangeClipboardValue({ from: fromInput, to: toInput }),
      );
    } catch {
      setError("Could not copy the time range.");
    }
  }

  async function pasteRange() {
    try {
      const text = await navigator.clipboard.readText();
      const parsed = parseTimeRangeClipboardValue(text);
      if (!parsed) {
        throw new Error("Invalid range");
      }
      setFromInput(parsed.from);
      setToInput(parsed.to);
      setError(null);
    } catch {
      setError("Paste a copied time range JSON value.");
    }
  }

  function renderMonth(month: Date) {
    const days = createMonthDays(month);
    const monthLabel = new Intl.DateTimeFormat([], {
      month: "long",
      year: "numeric",
    }).format(month);
    const previewEnd =
      draftStart &&
      !draftEnd &&
      hoveredDate &&
      compareDay(hoveredDate, draftStart) >= 0
        ? hoveredDate
        : draftEnd;

    return (
      <div className="min-w-[224px]">
        <div className="mb-2 flex items-center justify-between">
          <span className="font_metric_caption text-foreground-primary">
            {monthLabel}
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAY_LABELS.map((weekday) => (
            <span
              key={weekday}
              className="font_metric_caption text-center text-foreground-secondary"
            >
              {weekday}
            </span>
          ))}
          {days.map((day) => {
            const isStart = isSameDay(day.date, draftStart);
            const isEnd = isSameDay(day.date, previewEnd);
            const inRange =
              draftStart &&
              previewEnd &&
              compareDay(day.date, draftStart) >= 0 &&
              compareDay(day.date, previewEnd) <= 0;

            return (
              <Button
                key={day.date.toISOString()}
                type="button"
                className={twMerge(
                  "font_metric_caption min-h-7 cursor-pointer rounded-panel border border-transparent text-center transition-colors",
                  day.inCurrentMonth
                    ? "text-foreground-primary"
                    : "text-foreground-secondary",
                  inRange && "bg-accent/10",
                  (isStart || isEnd) &&
                    "border-accent bg-accent/10 text-accent",
                )}
                onClick={() => handleDayClick(day.date)}
                onMouseEnter={() => setHoveredDate(startOfDay(day.date))}
              >
                {day.date.getDate()}
              </Button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="flex flex-wrap items-center gap-2">
        {!presetOnly && showNavigationControls ? (
          <div
            className="inline-flex overflow-hidden rounded-panel border border-border-default bg-surface-primary text-foreground-primary shadow-sm"
            data-testid="dashboard-time-range-picker-toolbar"
          >
            <Button
              ariaLabel="Move time range backwards"
              className="grid h-9 w-9 place-items-center border-r border-border-default text-foreground-secondary transition-colors hover:bg-surface-secondary hover:text-foreground-primary"
              onClick={() => moveWindow(-1)}
              disabled={disabled || !currentWindow}
            >
              <span aria-hidden="true">«</span>
            </Button>
            <Button
              aria-expanded={isOpen}
              ariaLabel={`Time range selected: ${label}`}
              className="font_metric_caption flex h-9 min-w-[11rem] items-center gap-2 px-3 text-left text-foreground-primary transition-colors hover:bg-surface-secondary"
              disabled={disabled}
              onClick={() => setIsOpen((open) => !open)}
            >
              <Icon icon="clock" decorative className="h-4 w-4" />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <Icon
                icon="chevron"
                decorative
                className="h-3.5 w-3.5 rotate-90"
              />
            </Button>
            <Button
              ariaLabel="Move time range forwards"
              className="grid h-9 w-9 place-items-center border-l border-border-default text-foreground-secondary transition-colors hover:bg-surface-secondary hover:text-foreground-primary"
              onClick={() => moveWindow(1)}
              disabled={disabled || !canMoveForward}
            >
              <span aria-hidden="true">»</span>
            </Button>
            <Button
              ariaLabel="Zoom out time range"
              className="grid h-9 w-9 place-items-center border-l border-border-default text-foreground-secondary transition-colors hover:bg-surface-secondary hover:text-foreground-primary"
              onClick={zoomOut}
              disabled={disabled || !currentWindow}
            >
              <Icon icon="zoom-out" decorative className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <SecondaryButton
            aria-expanded={isOpen}
            ariaLabel={`Time range selected: ${label}`}
            className="h-10 min-w-[11rem] justify-start text-left"
            data-testid="dashboard-time-range-picker-toolbar"
            disabled={disabled}
            onClick={() => setIsOpen((open) => !open)}
          >
            <Icon icon="clock" decorative className="h-4 w-4" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <Icon icon="chevron" decorative className="h-3.5 w-3.5 rotate-90" />
          </SecondaryButton>
        )}

        {toolbarControls}
      </div>

      <div
        aria-hidden={!isOpen}
        className={twMerge(
          "grid transition-[grid-template-rows,opacity,translate,margin] duration-300 ease-in-out motion-reduce:transition-none",
          panelMode === "inline"
            ? "relative w-full"
            : "absolute left-0 top-[calc(100%+0.5rem)] z-30",
          isOpen
            ? "grid-rows-[1fr] translate-y-0 opacity-100"
            : "pointer-events-none grid-rows-[0fr] -translate-y-2 opacity-0",
          panelMode === "inline" && (isOpen ? "mt-2" : "mt-0"),
        )}
        data-testid="dashboard-time-range-picker-transition"
        inert={!isOpen}
      >
        <div className="min-h-0 overflow-hidden">
          <section
            className={twMerge(
              "min-h-0 overflow-hidden rounded-panel border border-border-default bg-surface-primary text-foreground-primary shadow-xl",
              presetOnly
                ? "w-[min(calc(100vw-2rem),20rem)]"
                : "h-[min(31rem,calc(100vh-8rem))] w-[min(calc(100vw-2rem),42rem)] max-lg:w-[min(calc(100vw-2rem),31rem)]",
            )}
            data-testid="dashboard-time-range-picker-panel"
          >
            <div
              className={twMerge(
                "grid min-h-0 grid-cols-1 overflow-hidden",
                presetOnly ? "" : "h-full md:grid-cols-[1fr_15rem]",
              )}
            >
              {!presetOnly ? (
                <div className="grid min-h-0 content-start gap-4 overflow-auto border-b border-border-default p-3 md:border-b-0 md:border-r">
                  <div className="grid gap-3">
                    <div className="flex items-center justify-between gap-4">
                      <p className="font_metric_caption text-foreground-secondary">
                        Absolute time range
                      </p>
                      <span className="font_metric_caption text-foreground-secondary">
                        {timeZone}
                      </span>
                    </div>
                    <label className="grid gap-1">
                      <span className="font_metric_caption text-foreground-secondary">
                        From
                      </span>
                      <div className="flex overflow-hidden rounded-panel border border-border-default bg-surface-elevated">
                        <Input
                          className="font_body_3 min-w-0 flex-1 bg-transparent px-3 py-2 text-foreground-primary outline-none"
                          value={fromInput}
                          onChange={(event) => setFromInput(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              applyRawRange({
                                from: fromInput,
                                to: toInput,
                              });
                            }
                          }}
                        />
                        <Button
                          ariaLabel="Open calendar"
                          className="grid w-10 place-items-center border-l border-border-default text-foreground-primary"
                          onClick={handleCalendarOpen}
                        >
                          <Icon
                            decorative
                            icon="calendar-days"
                            className="h-4 w-4"
                          />
                        </Button>
                      </div>
                    </label>
                    <label className="grid gap-1">
                      <span className="font_metric_caption text-foreground-secondary">
                        To
                      </span>
                      <div className="flex overflow-hidden rounded-panel border border-border-default bg-surface-elevated">
                        <Input
                          className="font_body_3 min-w-0 flex-1 bg-transparent px-3 py-2 text-foreground-primary outline-none"
                          value={toInput}
                          onChange={(event) => setToInput(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              applyRawRange({
                                from: fromInput,
                                to: toInput,
                              });
                            }
                          }}
                        />
                        <Button
                          ariaLabel="Open calendar"
                          className="grid w-10 place-items-center border-l border-border-default text-foreground-primary"
                          onClick={handleCalendarOpen}
                        >
                          <Icon
                            decorative
                            icon="calendar-days"
                            className="h-4 w-4"
                          />
                        </Button>
                      </div>
                    </label>
                    {error && (
                      <p className="font_metric_caption text-signal-warning-text">
                        {error}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <SecondaryButton size="sm" onClick={copyRange}>
                        Copy
                      </SecondaryButton>
                      <SecondaryButton size="sm" onClick={pasteRange}>
                        Paste
                      </SecondaryButton>
                      <SecondaryButton
                        size="sm"
                        onClick={() =>
                          applyRawRange({ from: fromInput, to: toInput })
                        }
                      >
                        Apply time range
                      </SecondaryButton>
                    </div>
                  </div>

                  {draftStart && (
                    <div className="grid gap-3 border-t border-border-default pt-3">
                      <div className="flex items-center justify-between">
                        <p className="font_metric_caption text-foreground-secondary">
                          Calendar
                        </p>
                        <div className="flex gap-1">
                          <Button
                            className="grid h-7 w-7 place-items-center rounded-panel border border-border-default"
                            onClick={() =>
                              setLeftMonth(addMonths(leftMonth, -1))
                            }
                          >
                            ‹
                          </Button>
                          <Button
                            className="grid h-7 w-7 place-items-center rounded-panel border border-border-default"
                            onClick={() =>
                              setLeftMonth(addMonths(leftMonth, 1))
                            }
                          >
                            ›
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-4">
                        {renderMonth(leftMonth)}
                        {renderMonth(addMonths(leftMonth, 1))}
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          className="font_metric_caption rounded-panel border border-border-default px-2 py-1.5 text-foreground-secondary"
                          onClick={() => setDraftStart(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          className="font_metric_label rounded-panel border border-accent bg-accent/10 px-3 py-1.5 text-accent"
                          disabled={!draftStart || !draftEnd}
                          onClick={applyCalendarRange}
                        >
                          Use dates
                        </Button>
                      </div>
                    </div>
                  )}

                  {recents.length > 0 && (
                    <div className="grid gap-2 border-t border-border-default pt-3">
                      <p className="font_metric_caption text-foreground-secondary">
                        Recently used absolute ranges
                      </p>
                      <div className="grid gap-1">
                        {recents.map((recent) => {
                          const resolved = resolveRawTimeRange(recent, {
                            timeZone,
                          });
                          return (
                            <Button
                              key={`${recent.from}-${recent.to}`}
                              className="font_metric_caption rounded-panel px-2 py-1.5 text-left text-foreground-secondary hover:bg-surface-secondary hover:text-foreground-primary"
                              onClick={() =>
                                applyRawRange(recent, resolved?.display)
                              }
                            >
                              {resolved?.display ??
                                `${recent.from} to ${recent.to}`}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              <div
                className={twMerge(
                  "grid min-h-0 overflow-hidden",
                  presetOnly ? "" : "grid-rows-[auto_auto_1fr]",
                )}
              >
                <div className="border-b border-border-default p-2">
                  <div className="flex flex-wrap gap-1">
                    {availablePresetRanges.map((range) => (
                      <Button
                        key={range.key}
                        className={twMerge(
                          "font_metric_caption rounded-panel px-2 py-1.5 transition-colors",
                          activePreset === range.key
                            ? "bg-surface-secondary text-foreground-primary"
                            : "text-foreground-primary hover:bg-surface-secondary",
                        )}
                        onClick={() => applyPresetRange(range.key)}
                      >
                        {range.label}
                      </Button>
                    ))}
                  </div>
                </div>
                {!presetOnly ? (
                  <>
                    <div className="border-b border-border-default p-2">
                      <Input
                        aria-label="Search quick ranges"
                        className="font_metric_caption w-full rounded-panel border border-border-default bg-surface-elevated px-2 py-2 text-foreground-primary outline-none"
                        placeholder="Search quick ranges"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                    </div>
                    <div className="overflow-auto p-1">
                      {filteredQuickRanges.map((option) => {
                        const disabled =
                          !option.resolved ||
                          option.resolved.exceedsSafetyCap ||
                          windowExceedsRangeLimit(
                            option.resolved.window,
                            maxRangeDays,
                          );
                        return (
                          <Button
                            key={`${option.from}-${option.to}-${option.display}`}
                            disabled={disabled}
                            title={
                              disabled
                                ? `Limited to ${maxRangeDays} days`
                                : undefined
                            }
                            className={twMerge(
                              "font_metric_caption flex w-full items-center justify-between rounded-panel px-2 py-1.5 text-left transition-colors",
                              disabled
                                ? "cursor-not-allowed text-foreground-secondary opacity-45"
                                : "text-foreground-secondary hover:bg-surface-secondary hover:text-foreground-primary",
                            )}
                            onClick={() => {
                              if (!disabled) {
                                applyRawRange(
                                  { from: option.from, to: option.to },
                                  option.display,
                                );
                              }
                            }}
                          >
                            <span>{option.display}</span>
                            {disabled && (
                              <span className="ml-2 text-signal-warning-text">
                                {maxRangeDays}d
                              </span>
                            )}
                          </Button>
                        );
                      })}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
