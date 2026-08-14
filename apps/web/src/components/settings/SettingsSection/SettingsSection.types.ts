import type { HTMLAttributes, ReactNode, Ref } from "react";

export type SettingsSectionProps = Omit<
  HTMLAttributes<HTMLElement>,
  "title"
> & {
  description?: ReactNode;
  descriptionClassName?: string;
  headingId?: string;
  headingRef?: Ref<HTMLHeadingElement>;
  headingTabIndex?: number;
  separated?: boolean;
  title: ReactNode;
};
