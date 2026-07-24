import { useId } from "react";
import { FormField } from "@/components/FormField";
import { twMerge } from "@/lib/ui/twMerge";
import type { SelectFieldProps } from "./SelectField.types";

export function SelectField({
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  className,
  containerClassName,
  errorMessage,
  helperText,
  id,
  label,
  labelClassName,
  optionalText,
  options,
  selectClassName,
  visuallyHideLabel = false,
  ...props
}: SelectFieldProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const describedBy = [
    ariaDescribedBy,
    helperText ? `${selectId}-helper` : undefined,
    errorMessage ? `${selectId}-error` : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <FormField
      className={containerClassName}
      errorMessage={errorMessage}
      helperText={helperText}
      inputId={selectId}
      label={label}
      labelClassName={twMerge(visuallyHideLabel && "sr-only", labelClassName)}
      optionalText={optionalText}
    >
      <select
        {...props}
        aria-describedby={describedBy || undefined}
        aria-invalid={ariaInvalid ?? Boolean(errorMessage)}
        className={twMerge(
          "font_ui_input h-10 w-full rounded-md border border-border-default bg-surface-primary px-3 text-foreground-primary shadow-sm transition-colors",
          "hover:border-border-hover",
          "disabled:cursor-not-allowed disabled:border-border-disabled disabled:opacity-50",
          "focus-visible:border-border-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active",
          errorMessage &&
            "border-signal-error-text focus-visible:border-signal-error-text focus-visible:ring-signal-error-text",
          selectClassName,
          className,
        )}
        id={selectId}
      >
        {options.map((option) => (
          <option
            disabled={option.disabled}
            key={option.value}
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>
    </FormField>
  );
}
