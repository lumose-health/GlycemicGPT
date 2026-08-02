import { twMerge } from "@/lib/ui/twMerge";
import { LumoseLoadingLogo } from "@/components/LumoseLoadingLogo";
import type { LoadingStateProps } from "./LoadingState.types";

export function LoadingState({
  className,
  label,
  role = "status",
  ...props
}: LoadingStateProps) {
  return (
    <div
      {...props}
      aria-label={label}
      aria-live="polite"
      role={role}
      className={twMerge(
        "flex min-h-72 flex-col items-center justify-center text-center",
        className,
      )}
    >
      <LumoseLoadingLogo decorative label={label} />
      <p className="font_poppins font_body_2 mt-4 text-foreground-secondary">
        {label}
      </p>
    </div>
  );
}
