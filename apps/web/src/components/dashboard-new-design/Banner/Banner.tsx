import { twMerge } from "@/lib/ui/twMerge";
import type { BannerProps } from "./Banner.types";

const DEFAULT_MESSAGE = "Not medical advice";

export function Banner({ message = DEFAULT_MESSAGE, className }: BannerProps) {
  return (
    <div
      className={twMerge(
        "flex h-8 min-h-8 w-full shrink-0 items-center justify-center overflow-hidden bg-surface-fixed-dark px-3 text-center font_metric_caption text-foreground-fixed-light",
        className,
      )}
    >
      {message}
    </div>
  );
}
