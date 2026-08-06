import { z } from "zod";

import {
  MAX_SYNC_INTERVAL,
  MIN_SYNC_INTERVAL,
} from "./tandemSyncSettings.helpers";

export const TANDEM_SYNC_INTERVAL_ERROR_MESSAGE = `Interval must be a whole number between ${MIN_SYNC_INTERVAL} and ${MAX_SYNC_INTERVAL} minutes`;

export const tandemSyncIntervalSchema = z
  .string()
  .trim()
  .refine((value) => {
    if (!value) return false;

    const interval = Number(value);
    return (
      Number.isFinite(interval) &&
      Number.isInteger(interval) &&
      interval >= MIN_SYNC_INTERVAL &&
      interval <= MAX_SYNC_INTERVAL
    );
  }, TANDEM_SYNC_INTERVAL_ERROR_MESSAGE)
  .transform(Number);
