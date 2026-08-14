import { Input } from "@/base/Input";
import { twMerge } from "@/lib/ui/twMerge";
import type { SwitchProps } from "./Switch.types";

export function Switch({
  checked,
  className,
  containerClassName,
  disabled,
  label,
  onCheckedChange,
  visuallyHideLabel = false,
  ...props
}: SwitchProps) {
  return (
    <label
      className={twMerge(
        "font_body_2 inline-flex cursor-pointer items-center gap-3 text-foreground-primary",
        disabled && "cursor-not-allowed opacity-60",
        containerClassName,
      )}
    >
      <Input
        {...props}
        checked={checked}
        className="peer sr-only"
        disabled={disabled}
        onChange={(event) => onCheckedChange?.(event.target.checked)}
        role="switch"
        type="checkbox"
      />
      <span
        aria-hidden="true"
        className={twMerge(
          "relative h-6 w-11 shrink-0 rounded-pill border border-border-active bg-surface-secondary transition-colors",
          "after:absolute after:left-px after:top-px after:h-5 after:w-5 after:rounded-pill after:bg-foreground-primary after:transition-transform after:content-['']",
          "peer-checked:border-accent peer-checked:bg-accent peer-checked:after:translate-x-5 peer-checked:after:bg-accent-foreground",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-border-active",
          "peer-disabled:border-border-disabled",
          className,
        )}
      />
      <span className={twMerge(visuallyHideLabel && "sr-only")}>{label}</span>
    </label>
  );
}
