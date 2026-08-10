import type { ReactNode, SelectHTMLAttributes } from "react";

export type SelectFieldOption = {
  disabled?: boolean;
  label: ReactNode;
  value: string;
};

export type SelectFieldProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "children"
> & {
  containerClassName?: string;
  errorMessage?: ReactNode;
  helperText?: ReactNode;
  label: ReactNode;
  labelClassName?: string;
  options: SelectFieldOption[];
  optionalText?: ReactNode;
  selectClassName?: string;
  visuallyHideLabel?: boolean;
};
