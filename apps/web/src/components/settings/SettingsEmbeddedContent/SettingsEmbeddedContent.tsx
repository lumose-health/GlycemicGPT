import { twMerge } from "@/lib/ui/twMerge";

import type { SettingsEmbeddedContentProps } from "./SettingsEmbeddedContent.types";

export function SettingsEmbeddedContent({
  className,
  ...props
}: SettingsEmbeddedContentProps) {
  return (
    <div
      className={twMerge(
        "space-y-6 text-foreground-primary [&_[data-settings-back-link]]:hidden [&_[data-settings-page-header]]:hidden",
        className,
      )}
      {...props}
    />
  );
}
