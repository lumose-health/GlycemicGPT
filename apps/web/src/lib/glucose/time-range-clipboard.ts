import type { RawTimeRangeInput } from './time-range-expressions';

export const TIME_RANGE_CLIPBOARD_FORMAT = 'veno.dashboard.time-range';
export const TIME_RANGE_CLIPBOARD_VERSION = 1;

interface TimeRangeClipboardPayload {
  format: typeof TIME_RANGE_CLIPBOARD_FORMAT;
  version: typeof TIME_RANGE_CLIPBOARD_VERSION;
  range: RawTimeRangeInput;
}

const isRawTimeRangeInput = (value: unknown): value is RawTimeRangeInput => (
  Boolean(value)
  && typeof value === 'object'
  && typeof (value as Partial<RawTimeRangeInput>).from === 'string'
  && typeof (value as Partial<RawTimeRangeInput>).to === 'string'
);

const isTimeRangeClipboardPayload = (value: unknown): value is TimeRangeClipboardPayload => (
  Boolean(value)
  && typeof value === 'object'
  && (value as Partial<TimeRangeClipboardPayload>).format === TIME_RANGE_CLIPBOARD_FORMAT
  && (value as Partial<TimeRangeClipboardPayload>).version === TIME_RANGE_CLIPBOARD_VERSION
  && isRawTimeRangeInput((value as Partial<TimeRangeClipboardPayload>).range)
);

export const createTimeRangeClipboardPayload = (
  range: RawTimeRangeInput,
): TimeRangeClipboardPayload => ({
  format: TIME_RANGE_CLIPBOARD_FORMAT,
  version: TIME_RANGE_CLIPBOARD_VERSION,
  range,
});

export const serializeTimeRangeClipboardValue = (range: RawTimeRangeInput): string => (
  JSON.stringify(createTimeRangeClipboardPayload(range))
);

export const parseTimeRangeClipboardValue = (text: string): RawTimeRangeInput | null => {
  try {
    const parsed = JSON.parse(text) as unknown;

    if (isTimeRangeClipboardPayload(parsed)) {
      return parsed.range;
    }

    if (isRawTimeRangeInput(parsed)) {
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
};
