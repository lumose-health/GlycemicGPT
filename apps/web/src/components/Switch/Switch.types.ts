import type { InputHTMLAttributes, ReactNode } from "react";

export type SwitchProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "type"
> & {
  containerClassName?: string;
  label: ReactNode;
  onCheckedChange?: (checked: boolean) => void;
  visuallyHideLabel?: boolean;
};
