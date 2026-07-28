import { twMerge } from "@/lib/ui/twMerge";
import styles from "./SettingsPage.module.css";
import type { SettingsPageProps } from "./SettingsPage.types";

export function SettingsPage({ className, ...props }: SettingsPageProps) {
  return (
    <div
      {...props}
      className={twMerge(
        "font_poppins mx-auto w-full max-w-5xl space-y-12 pt-8",
        styles.root,
        className,
      )}
    />
  );
}
