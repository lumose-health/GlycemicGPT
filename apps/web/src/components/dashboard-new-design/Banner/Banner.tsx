import { twMerge } from "@/lib/ui/twMerge";
import type { BannerProps, BannerTheme } from "./Banner.types";

const THEMES: Record<BannerTheme, { className: string; message: string }> = {
  default: {
    className: "bg-surface-fixed-dark text-foreground-fixed-light",
    message: "Not medical advice",
  },
  mock: {
    className:
      "h-auto bg-surface-fixed-critical py-1 text-foreground-fixed-light",
    message:
      "Mock data is active. All data shown is generated and is not your own.",
  },
};

export function Banner({ theme = "default", message, className }: BannerProps) {
  const selectedTheme = THEMES[theme];

  return (
    <div
      className={twMerge(
        "flex h-8 min-h-8 w-full shrink-0 items-center justify-center overflow-hidden px-3 text-center font_metric_caption",
        selectedTheme.className,
        className,
      )}
    >
      {message ?? selectedTheme.message}
    </div>
  );
}
