import { forwardRef, useId, type Ref } from "react";
import { Input } from "@/base/Input";
import { FormField } from "@/components/FormField";
import { twMerge } from "@/lib/ui/twMerge";
import type { TextInputProps } from "./textInput.types";

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  (
    {
      className,
      containerClassName,
      errorMessage,
      errorMessages,
      helperText,
      id,
      inputClassName,
      label,
      labelClassName,
      leadingAdornment,
      optionalText,
      trailingAdornment,
      "aria-describedby": ariaDescribedBy,
      "aria-invalid": ariaInvalid,
      ...props
    }: TextInputProps,
    ref: Ref<HTMLInputElement>,
  ) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;
    // V2 forms publish Zod errors on submit, then remove resolved visible
    // messages on change. This component only renders the errors it receives.
    const hasErrors = Boolean(errorMessage) || Boolean(errorMessages?.length);
    const describedBy = [
      ariaDescribedBy,
      helperText ? helperId : undefined,
      hasErrors ? errorId : undefined,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <FormField
        className={containerClassName}
        errorMessage={errorMessage}
        errorMessages={errorMessages}
        helperText={helperText}
        inputId={inputId}
        label={label}
        labelClassName={labelClassName}
        optionalText={optionalText}
      >
        <div className="relative">
          {leadingAdornment ? (
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-foreground-secondary">
              {leadingAdornment}
            </span>
          ) : null}
          <Input
            {...props}
            aria-describedby={describedBy || undefined}
            aria-invalid={ariaInvalid ?? hasErrors}
            className={twMerge(
              "font_ui_input h-10 w-full rounded-panel border border-border-default bg-surface-primary px-3 text-foreground-primary shadow-sm transition-colors",
              "placeholder:text-foreground-primary/60",
              "hover:border-border-hover",
              "disabled:cursor-not-allowed disabled:border-border-disabled disabled:opacity-50",
              "focus-visible:border-border-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active",
              leadingAdornment && "pl-10",
              trailingAdornment && "pr-10",
              hasErrors &&
                "border-signal-error-text focus-visible:border-signal-error-text focus-visible:ring-signal-error-text",
              inputClassName,
              className,
            )}
            id={inputId}
            ref={ref}
          />
          {trailingAdornment ? (
            <span className="absolute inset-y-0 right-3 flex items-center">
              {trailingAdornment}
            </span>
          ) : null}
        </div>
      </FormField>
    );
  },
);

TextInput.displayName = "TextInput";
