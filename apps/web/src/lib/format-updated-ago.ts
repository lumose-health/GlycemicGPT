export function formatUpdatedAgo(
  timestamp: string | null | undefined,
  now: number,
): string | null {
  if (!timestamp) return null;

  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return null;

  const totalSeconds = Math.floor(Math.max(0, now - then) / 1_000);
  if (totalSeconds < 60) return `Updated ${totalSeconds}s ago`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `Updated ${minutes}m ${seconds}s ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;

  return `Updated ${Math.floor(hours / 24)}d ago`;
}
