import type { ReactNode } from "react";

export type SegmentedControlOption<T extends string> = {
  disabled?: boolean;
  label: ReactNode;
  meta?: ReactNode;
  value: T;
};

export type SegmentedControlProps<T extends string> = {
  "aria-label": string;
  className?: string;
  onChange: (value: T) => void;
  options: SegmentedControlOption<T>[];
  value: T;
};
