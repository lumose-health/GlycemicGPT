import { twMerge } from "@/lib/ui/twMerge";
import type { SettingsPageProps } from "./SettingsPage.types";

export function SettingsPage({
  className,
  ...props
}: SettingsPageProps) {
  return (
    <div
      {...props}
      className={twMerge("mx-auto w-full max-w-5xl space-y-12 pt-8", className)}
    />
  );
}
