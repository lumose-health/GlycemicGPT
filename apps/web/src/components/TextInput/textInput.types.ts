import type { ReactNode } from "react";
import type { InputProps } from "@/base/Input";

export type TextInputProps = InputProps & {
  containerClassName?: string;
  errorMessage?: ReactNode;
  errorMessages?: readonly ReactNode[];
  helperText?: ReactNode;
  inputClassName?: string;
  label: ReactNode;
  labelClassName?: string;
  leadingAdornment?: ReactNode;
  optionalText?: ReactNode;
  trailingAdornment?: ReactNode;
};
