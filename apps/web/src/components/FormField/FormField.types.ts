import type { HTMLAttributes, ReactNode } from "react";

export type FormFieldProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  errorMessage?: ReactNode;
  helperText?: ReactNode;
  inputId: string;
  label: ReactNode;
  labelClassName?: string;
  optionalText?: ReactNode;
};
