import type { UnreadBadgeProps } from "./UnreadBadge.types";

export function UnreadBadge({ count }: UnreadBadgeProps) {
  if (count <= 0) {
    return null;
  }

  const display = count > 99 ? "99+" : String(count);

  return (
    <span
      aria-label={`${count} unread`}
      className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-panel bg-accent px-1.5 font_metric_caption text-accent-foreground"
    >
      {display}
    </span>
  );
}
