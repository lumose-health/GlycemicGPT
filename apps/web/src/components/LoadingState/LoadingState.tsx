import { twMerge } from "@/lib/ui/twMerge";
import type { LoadingStateProps } from "./LoadingState.types";

export function LoadingState({
  className,
  label,
  ...props
}: LoadingStateProps) {
  return (
    <div
      {...props}
      aria-live="polite"
      className={twMerge(
        "flex min-h-72 flex-col items-center justify-center text-center",
        className,
      )}
      role="status"
    >
      <span
        aria-hidden="true"
        className="h-7 w-7 animate-spin rounded-full border-2 border-border-default border-t-accent"
      />
      <p className="font_poppins font_body_2 mt-4 text-foreground-secondary">
        {label}
      </p>
    </div>
  );
}
