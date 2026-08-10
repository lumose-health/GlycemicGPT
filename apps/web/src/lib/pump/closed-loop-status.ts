export type LoopState = "looping" | "not_looping" | "failed";

export interface LoopStatusInfo {
  state: LoopState;
  source: string;
  issuedAt: string;
  failureReason?: string | null;
}

export interface OverrideInfo {
  name: string;
  startedAt: string;
  endsAt?: string | null;
  multiplier?: number | null;
  targetLowMgdl?: number | null;
  targetHighMgdl?: number | null;
}

export function parseLoopState(value: string): LoopState | null {
  return value === "looping" ||
    value === "not_looping" ||
    value === "failed"
    ? value
    : null;
}

const SOURCE_NAMES = new Map<string, string>([
  ["loop", "Loop"],
  ["aaps", "AAPS"],
  ["trio", "Trio"],
  ["oref0", "oref0"],
  ["iaps", "iAPS"],
  ["glycemicgpt", "GlycemicGPT"],
]);

export function prettySourceName(source: string): string {
  return SOURCE_NAMES.get(source) ?? "Closed loop";
}

export function formatOverrideRemaining(
  endsAt: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!endsAt) return null;

  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return null;

  const minutes = Math.round((end.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}
