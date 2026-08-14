export interface RawTimeRangeInput {
  from: string;
  to: string;
}

export interface QuickRangeOption extends RawTimeRangeInput {
  display: string;
}

export interface ResolvedTimeRangeInput extends RawTimeRangeInput {
  window: {
    from: string;
    to: string;
  };
  display: string;
  exceedsSafetyCap: boolean;
}

interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

interface DateMathOperation {
  sign: 1 | -1;
  amount: number;
  unit: DateMathUnit;
}

type DateMathUnit = 'm' | 'h' | 'd' | 'w' | 'M' | 'Q' | 'y' | 'fQ' | 'fy';

const DATE_MATH_PATTERN = /^now((?:[+-]\d+(?:fQ|fy|[mhdwMQy]))*)(?:\/(fQ|fy|[dhwMQy]))?$/;
const DATE_MATH_OPERATION_PATTERN = /([+-])(\d+)(fQ|fy|[mhdwMQy])/g;
const SAFETY_CAP_MS = 366 * 24 * 60 * 60 * 1000;
const MAX_TIME_VALUE_MS = 8.64e15;
const COMMON_DATE_TIME_FORMAT = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/;

export const TIME_RANGE_SAFETY_CAP_DAYS = 366;

export const DASHBOARD_QUICK_RANGES: QuickRangeOption[] = [
  { from: 'now-5m', to: 'now', display: 'Last 5 minutes' },
  { from: 'now-15m', to: 'now', display: 'Last 15 minutes' },
  { from: 'now-30m', to: 'now', display: 'Last 30 minutes' },
  { from: 'now-1h', to: 'now', display: 'Last 1 hour' },
  { from: 'now-3h', to: 'now', display: 'Last 3 hours' },
  { from: 'now-6h', to: 'now', display: 'Last 6 hours' },
  { from: 'now-12h', to: 'now', display: 'Last 12 hours' },
  { from: 'now-24h', to: 'now', display: 'Last 24 hours' },
  { from: 'now-2d', to: 'now', display: 'Last 2 days' },
  { from: 'now-7d', to: 'now', display: 'Last 7 days' },
  { from: 'now-30d', to: 'now', display: 'Last 30 days' },
  { from: 'now-90d', to: 'now', display: 'Last 90 days' },
  { from: 'now-6M', to: 'now', display: 'Last 6 months' },
  { from: 'now-1y', to: 'now', display: 'Last 1 year' },
  { from: 'now-2y', to: 'now', display: 'Last 2 years' },
  { from: 'now-5y', to: 'now', display: 'Last 5 years' },
  { from: 'now-1d/d', to: 'now-1d/d', display: 'Yesterday' },
  { from: 'now-2d/d', to: 'now-2d/d', display: 'Day before yesterday' },
  { from: 'now-7d/d', to: 'now-7d/d', display: 'This day last week' },
  { from: 'now-1w/w', to: 'now-1w/w', display: 'Previous week' },
  { from: 'now-1M/M', to: 'now-1M/M', display: 'Previous month' },
  { from: 'now-1Q/fQ', to: 'now-1Q/fQ', display: 'Previous fiscal quarter' },
  { from: 'now-1y/y', to: 'now-1y/y', display: 'Previous year' },
  { from: 'now-1y/fy', to: 'now-1y/fy', display: 'Previous fiscal year' },
  { from: 'now/d', to: 'now/d', display: 'Today' },
  { from: 'now/d', to: 'now', display: 'Today so far' },
  { from: 'now/w', to: 'now/w', display: 'This week' },
  { from: 'now/w', to: 'now', display: 'This week so far' },
  { from: 'now/M', to: 'now/M', display: 'This month' },
  { from: 'now/M', to: 'now', display: 'This month so far' },
  { from: 'now/y', to: 'now/y', display: 'This year' },
  { from: 'now/y', to: 'now', display: 'This year so far' },
  { from: 'now/fQ', to: 'now', display: 'This fiscal quarter so far' },
  { from: 'now/fQ', to: 'now/fQ', display: 'This fiscal quarter' },
  { from: 'now/fy', to: 'now', display: 'This fiscal year so far' },
  { from: 'now/fy', to: 'now/fy', display: 'This fiscal year' },
];

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function getLocalParts(date: Date, timeZone: string): LocalDateTimeParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });
  const parts = formatter.formatToParts(date);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
    millisecond: date.getMilliseconds()
  };
}

function getTimeZoneOffsetMs(utcTimestamp: number, timeZone: string): number {
  const instant = new Date(utcTimestamp);
  const parts = getLocalParts(instant, timeZone);
  const zonedUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const plainUtc = Date.UTC(
    instant.getUTCFullYear(),
    instant.getUTCMonth(),
    instant.getUTCDate(),
    instant.getUTCHours(),
    instant.getUTCMinutes(),
    instant.getUTCSeconds()
  );

  return zonedUtc - plainUtc;
}

function localPartsToUtcIso(parts: LocalDateTimeParts, timeZone: string): string {
  let utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond
  );

  const initialOffset = getTimeZoneOffsetMs(utcGuess, timeZone);
  utcGuess -= initialOffset;

  const correctedOffset = getTimeZoneOffsetMs(utcGuess, timeZone);
  if (correctedOffset !== initialOffset) {
    utcGuess = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond
    );
    utcGuess -= correctedOffset;
  }

  return new Date(utcGuess).toISOString();
}

function localPartsToWallDate(parts: LocalDateTimeParts): Date {
  return new Date(Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond
  ));
}

function wallDateToLocalParts(date: Date): LocalDateTimeParts {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
    millisecond: date.getUTCMilliseconds()
  };
}

function addDateMathOperation(date: Date, operation: DateMathOperation): Date {
  const next = new Date(date.getTime());
  const amount = operation.amount * operation.sign;

  if (operation.unit === 'm') {
    next.setUTCMinutes(next.getUTCMinutes() + amount);
  } else if (operation.unit === 'h') {
    next.setUTCHours(next.getUTCHours() + amount);
  } else if (operation.unit === 'd') {
    next.setUTCDate(next.getUTCDate() + amount);
  } else if (operation.unit === 'w') {
    next.setUTCDate(next.getUTCDate() + amount * 7);
  } else if (operation.unit === 'M') {
    next.setUTCMonth(next.getUTCMonth() + amount);
  } else if (operation.unit === 'Q' || operation.unit === 'fQ') {
    next.setUTCMonth(next.getUTCMonth() + amount * 3);
  } else if (operation.unit === 'y' || operation.unit === 'fy') {
    next.setUTCFullYear(next.getUTCFullYear() + amount);
  }

  return next;
}

function getWeekStart(date: Date): Date {
  const next = new Date(date.getTime());
  const day = next.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  next.setUTCDate(next.getUTCDate() + mondayOffset);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

function getFiscalYearStart(date: Date, fiscalYearStartMonth: number): Date {
  const year = date.getUTCMonth() >= fiscalYearStartMonth ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return new Date(Date.UTC(year, fiscalYearStartMonth, 1, 0, 0, 0, 0));
}

function getFiscalQuarterStart(date: Date, fiscalYearStartMonth: number): Date {
  const fiscalYearStart = getFiscalYearStart(date, fiscalYearStartMonth);
  const monthOffset = (date.getUTCFullYear() - fiscalYearStart.getUTCFullYear()) * 12 +
    (date.getUTCMonth() - fiscalYearStart.getUTCMonth());
  const quarterOffset = Math.floor(monthOffset / 3) * 3;
  return new Date(Date.UTC(
    fiscalYearStart.getUTCFullYear(),
    fiscalYearStart.getUTCMonth() + quarterOffset,
    1,
    0,
    0,
    0,
    0
  ));
}

function startOfUnit(date: Date, unit: DateMathUnit, fiscalYearStartMonth: number): Date {
  if (unit === 'm') {
    const next = new Date(date.getTime());
    next.setUTCSeconds(0, 0);
    return next;
  }

  if (unit === 'h') {
    const next = new Date(date.getTime());
    next.setUTCMinutes(0, 0, 0);
    return next;
  }

  if (unit === 'd') {
    const next = new Date(date.getTime());
    next.setUTCHours(0, 0, 0, 0);
    return next;
  }

  if (unit === 'w') {
    return getWeekStart(date);
  }

  if (unit === 'M') {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
  }

  if (unit === 'Q') {
    const quarterMonth = Math.floor(date.getUTCMonth() / 3) * 3;
    return new Date(Date.UTC(date.getUTCFullYear(), quarterMonth, 1, 0, 0, 0, 0));
  }

  if (unit === 'fQ') {
    return getFiscalQuarterStart(date, fiscalYearStartMonth);
  }

  if (unit === 'fy') {
    return getFiscalYearStart(date, fiscalYearStartMonth);
  }

  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
}

function roundDate(date: Date, unit: DateMathUnit, roundUp: boolean, fiscalYearStartMonth: number): Date {
  const start = startOfUnit(date, unit, fiscalYearStartMonth);
  if (!roundUp) {
    return start;
  }

  const next = addDateMathOperation(start, { sign: 1, amount: 1, unit });
  next.setUTCMilliseconds(next.getUTCMilliseconds() - 1);
  return next;
}

function parseOperations(value: string): DateMathOperation[] {
  const operations: DateMathOperation[] = [];
  let match: RegExpExecArray | null;

  DATE_MATH_OPERATION_PATTERN.lastIndex = 0;
  while ((match = DATE_MATH_OPERATION_PATTERN.exec(value)) !== null) {
    operations.push({
      sign: match[1] === '+' ? 1 : -1,
      amount: Number(match[2]),
      unit: match[3] as DateMathUnit
    });
  }

  return operations;
}

export function isDateMathExpression(value: string): boolean {
  return DATE_MATH_PATTERN.test(value.trim());
}

export function resolveDateMathExpression(
  value: string,
  options: {
    now?: Date;
    roundUp?: boolean;
    timeZone: string;
    fiscalYearStartMonth?: number;
  }
): string | null {
  const expression = value.trim();
  const match = DATE_MATH_PATTERN.exec(expression);
  if (!match) {
    return null;
  }

  const fiscalYearStartMonth = options.fiscalYearStartMonth ?? 0;
  const now = options.now ?? new Date();
  let wallDate = localPartsToWallDate(getLocalParts(now, options.timeZone));

  for (const operation of parseOperations(match[1] ?? '')) {
    wallDate = addDateMathOperation(wallDate, operation);
    if (!Number.isFinite(wallDate.getTime())) {
      return null;
    }
  }

  const roundUnit = match[2] as DateMathUnit | undefined;
  if (roundUnit) {
    wallDate = roundDate(wallDate, roundUnit, Boolean(options.roundUp), fiscalYearStartMonth);
    if (!Number.isFinite(wallDate.getTime())) {
      return null;
    }
  }

  return localPartsToUtcIso(wallDateToLocalParts(wallDate), options.timeZone);
}

export function resolveTimeRangeInput(
  value: string,
  options: {
    now?: Date;
    roundUp?: boolean;
    timeZone: string;
    fiscalYearStartMonth?: number;
  }
): string | null {
  const trimmed = value.trim();

  if (isDateMathExpression(trimmed)) {
    return resolveDateMathExpression(trimmed, options);
  }

  if (trimmed.endsWith('Z')) {
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  if (!COMMON_DATE_TIME_FORMAT.test(trimmed)) {
    return null;
  }

  const [datePart, timePart = '00:00:00'] = trimmed.replace('T', ' ').split(' ');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour = 0, minute = 0, second = 0] = timePart.split(':').map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));

  if (
    year < 100 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59 ||
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() + 1 !== month ||
    calendarDate.getUTCDate() !== day
  ) {
    return null;
  }

  const millisecond = options.roundUp && !trimmed.includes(':') ? 999 : 0;

  return localPartsToUtcIso(
    {
      year,
      month,
      day,
      hour: options.roundUp && !trimmed.includes(':') ? 23 : hour,
      minute: options.roundUp && !trimmed.includes(':') ? 59 : minute,
      second: options.roundUp && !trimmed.includes(':') ? 59 : second,
      millisecond
    },
    options.timeZone
  );
}

export function resolveRawTimeRange(
  raw: RawTimeRangeInput,
  options: {
    display?: string;
    now?: Date;
    timeZone: string;
    fiscalYearStartMonth?: number;
  }
): ResolvedTimeRangeInput | null {
  const from = resolveTimeRangeInput(raw.from, {
    now: options.now,
    roundUp: false,
    timeZone: options.timeZone,
    fiscalYearStartMonth: options.fiscalYearStartMonth
  });
  const to = resolveTimeRangeInput(raw.to, {
    now: options.now,
    roundUp: true,
    timeZone: options.timeZone,
    fiscalYearStartMonth: options.fiscalYearStartMonth
  });

  if (!from || !to || new Date(to).getTime() <= new Date(from).getTime()) {
    return null;
  }

  const spanMs = new Date(to).getTime() - new Date(from).getTime();

  return {
    ...raw,
    window: { from, to },
    display: options.display ?? formatTimeRangeLabel({ from, to }, options.timeZone),
    exceedsSafetyCap: spanMs > SAFETY_CAP_MS
  };
}

export function formatAbsoluteTimeInput(iso: string, timeZone: string): string {
  const parts = getLocalParts(new Date(iso), timeZone);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)} ${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`;
}

export function formatTimeRangeLabel(window: RawTimeRangeInput, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat([], {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return `${formatter.format(new Date(window.from))} to ${formatter.format(new Date(window.to))}`;
}

function toBoundedTimeWindow(
  fromMs: number,
  toMs: number
): RawTimeRangeInput | null {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    return null;
  }

  const spanMs = Math.min(toMs - fromMs, SAFETY_CAP_MS);
  let boundedFromMs = fromMs;
  let boundedToMs = boundedFromMs + spanMs;

  if (boundedToMs > MAX_TIME_VALUE_MS) {
    boundedToMs = MAX_TIME_VALUE_MS;
    boundedFromMs = boundedToMs - spanMs;
  }
  if (boundedFromMs < -MAX_TIME_VALUE_MS) {
    boundedFromMs = -MAX_TIME_VALUE_MS;
    boundedToMs = boundedFromMs + spanMs;
  }

  return {
    from: new Date(boundedFromMs).toISOString(),
    to: new Date(boundedToMs).toISOString()
  };
}

export function shiftTimeWindow(
  window: RawTimeRangeInput,
  direction: -1 | 1
): RawTimeRangeInput | null {
  const fromMs = new Date(window.from).getTime();
  const toMs = new Date(window.to).getTime();
  const spanMs = toMs - fromMs;

  if (!Number.isFinite(spanMs) || spanMs <= 0) {
    return null;
  }

  const boundedSpanMs = Math.min(spanMs, SAFETY_CAP_MS);
  return direction === 1
    ? toBoundedTimeWindow(toMs, toMs + boundedSpanMs)
    : toBoundedTimeWindow(fromMs - boundedSpanMs, fromMs);
}

export function zoomOutTimeWindow(
  window: RawTimeRangeInput
): RawTimeRangeInput | null {
  const fromMs = new Date(window.from).getTime();
  const toMs = new Date(window.to).getTime();
  const spanMs = toMs - fromMs;

  if (!Number.isFinite(spanMs) || spanMs <= 0) {
    return null;
  }

  const centerMs = fromMs + spanMs / 2;
  const nextSpanMs = Math.min(spanMs * 2, SAFETY_CAP_MS);

  return toBoundedTimeWindow(
    centerMs - nextSpanMs / 2,
    centerMs + nextSpanMs / 2
  );
}
