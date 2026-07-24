import type { HTMLAttributes, ReactNode } from "react";

export type SettingsRowProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  control: ReactNode;
  description?: ReactNode;
  label: ReactNode;
  labelId?: string;
};
