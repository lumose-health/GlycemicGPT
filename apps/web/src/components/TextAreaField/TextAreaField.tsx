import { forwardRef, useId, type Ref } from "react";
import { FormField } from "@/components/FormField";
import { twMerge } from "@/lib/ui/twMerge";
import type { TextAreaFieldProps } from "./TextAreaField.types";

export const TextAreaField = forwardRef<
  HTMLTextAreaElement,
  TextAreaFieldProps
>(
  (
    {
      className,
      containerClassName,
      errorMessage,
      helperText,
      id,
      label,
      labelClassName,
      optionalText,
      "aria-describedby": ariaDescribedBy,
      "aria-invalid": ariaInvalid,
      ...props
    }: TextAreaFieldProps,
    ref: Ref<HTMLTextAreaElement>,
  ) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;
    const describedBy = [
      ariaDescribedBy,
      helperText ? helperId : undefined,
      errorMessage ? errorId : undefined,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <FormField
        className={containerClassName}
        errorMessage={errorMessage}
        helperText={helperText}
        inputId={inputId}
        label={label}
        labelClassName={labelClassName}
        optionalText={optionalText}
      >
        <textarea
          {...props}
          aria-describedby={describedBy || undefined}
          aria-invalid={ariaInvalid ?? Boolean(errorMessage)}
          className={twMerge(
            "font_ui_input min-h-24 w-full resize-y rounded-panel border border-border-default bg-surface-primary px-3 py-2 text-foreground-primary shadow-sm transition-colors",
            "placeholder:text-foreground-secondary",
            "hover:border-border-hover",
            "disabled:cursor-not-allowed disabled:border-border-disabled disabled:opacity-50",
            "focus-visible:border-border-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active",
            errorMessage &&
              "border-signal-error-text focus-visible:border-signal-error-text focus-visible:ring-signal-error-text",
            className,
          )}
          id={inputId}
          ref={ref}
        />
      </FormField>
    );
  },
);

TextAreaField.displayName = "TextAreaField";
