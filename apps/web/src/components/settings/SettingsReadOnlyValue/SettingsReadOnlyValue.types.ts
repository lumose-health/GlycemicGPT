import type { HTMLAttributes, ReactNode } from "react";

export type SettingsReadOnlyValueProps = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  labelClassName?: string;
  value: ReactNode;
  valueClassName?: string;
};
