import { forwardRef, type Ref } from "react";
import { Button } from "@/base";
import { twMerge } from "@/lib/ui/twMerge";
import type { DestructiveButtonProps } from "./DestructiveButton.types";

export const DestructiveButton = forwardRef<
  HTMLButtonElement,
  DestructiveButtonProps
>(
  (
    { children, className, ...props }: DestructiveButtonProps,
    ref: Ref<HTMLButtonElement>,
  ) => (
    <Button
      {...props}
      className={twMerge(
        "font_poppins font_body_3 inline-flex h-9 items-center justify-center gap-2 rounded-button border border-signal-error-text bg-surface-primary px-3 text-signal-error-text transition-colors",
        "hover:bg-surface-secondary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-error-text",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
    >
      {children}
    </Button>
  ),
);

DestructiveButton.displayName = "DestructiveButton";
