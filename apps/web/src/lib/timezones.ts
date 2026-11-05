/**
 * IANA timezone helpers for the per-user timezone setting.
 *
 * The browser's own zone fills the setting once (see `useCurrentUser`), and the
 * account settings page lets the user pick another. The API is the authority on
 * which names are valid: it accepts only tz database keys and answers 422
 * otherwise.
 */

/** Short list used when the runtime can't enumerate its zones. */
export const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
];

/** Same bound as the API column. */
const MAX_TIMEZONE_LENGTH = 64;

/**
 * The browser's IANA timezone, or `null` when it is missing, not a plain
 * region name, or UTC. Privacy modes (Firefox resistFingerprinting, Tor
 * Browser) report UTC whatever the real zone is, and saving that would
 * override a real brief-delivery zone; a user really on UTC can pick it.
 */
export function browserTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz || tz.length > MAX_TIMEZONE_LENGTH) return null;
    if (tz === "UTC" || tz.startsWith("Etc/")) return null;
    // Region/City or UTC-style keys only; rejects anything path-like.
    if (!/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/.test(tz)) return null;
    return tz;
  } catch {
    return null;
  }
}

/**
 * Sorted timezone choices for a picker, always including `current` and the
 * browser's zone so the saved value is selectable.
 */
export function timezoneOptions(current: string | null): string[] {
  let zones: string[] = COMMON_TIMEZONES;
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf?.("timeZone");
    if (supported && supported.length > 0) zones = supported;
  } catch {
    // Fall back to the short list.
  }
  const set = new Set(zones);
  set.add("UTC");
  const fromBrowser = browserTimezone();
  if (fromBrowser) set.add(fromBrowser);
  if (current) set.add(current);
  return [...set].sort();
}

/** Human label for a zone key: underscores become spaces. */
export function timezoneLabel(tz: string): string {
  return tz.replace(/_/g, " ");
}
