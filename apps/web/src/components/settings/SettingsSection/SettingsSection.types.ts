import type { HTMLAttributes, ReactNode } from "react";

export type SettingsSectionProps = Omit<
  HTMLAttributes<HTMLElement>,
  "title"
> & {
  description?: ReactNode;
  descriptionClassName?: string;
  headingId?: string;
  separated?: boolean;
  title: ReactNode;
};
