import type { ReactNode, TextareaHTMLAttributes } from "react";

export type TextAreaFieldProps =
  TextareaHTMLAttributes<HTMLTextAreaElement> & {
    containerClassName?: string;
    errorMessage?: ReactNode;
    helperText?: ReactNode;
    label: ReactNode;
    labelClassName?: string;
    optionalText?: ReactNode;
  };
