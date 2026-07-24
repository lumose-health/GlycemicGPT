import { twMerge } from "@/lib/ui/twMerge";
import type { FormFieldProps } from "./FormField.types";

export function FormField({
  children,
  className,
  errorMessage,
  helperText,
  inputId,
  label,
  labelClassName,
  optionalText,
  ...props
}: FormFieldProps) {
  return (
    <div {...props} className={twMerge("grid w-full gap-1.5", className)}>
      <label
        className={twMerge(
          "font_metric_label text-foreground-primary",
          labelClassName,
        )}
        htmlFor={inputId}
      >
        {label}
        {optionalText ? (
          <span className="font_body_3 ml-2 text-foreground-secondary">
            {" "}
            {optionalText}
          </span>
        ) : null}
      </label>
      {children}
      {helperText ? (
        <p
          className="font_body_3 text-foreground-secondary"
          id={`${inputId}-helper`}
        >
          {helperText}
        </p>
      ) : null}
      {errorMessage ? (
        <p
          aria-live="polite"
          className="font_body_3 text-signal-error-text"
          id={`${inputId}-error`}
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
