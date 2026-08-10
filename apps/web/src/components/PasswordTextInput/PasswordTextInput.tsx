"use client";

import { forwardRef, useState, type Ref } from "react";
import { Button, Icon } from "@/base";
import { TextInput } from "@/components/TextInput";
import { twMerge } from "@/lib/ui/twMerge";
import type { PasswordTextInputProps } from "./PasswordTextInput.types";

export const PasswordTextInput = forwardRef<
  HTMLInputElement,
  PasswordTextInputProps
>(
  (
    {
      hidePasswordLabel = "Hide password",
      inputClassName,
      showPasswordLabel = "Show password",
      ...props
    }: PasswordTextInputProps,
    ref: Ref<HTMLInputElement>,
  ) => {
    const [isVisible, setIsVisible] = useState(false);

    return (
      <TextInput
        {...props}
        inputClassName={twMerge("pr-12", inputClassName)}
        ref={ref}
        trailingAdornment={
          <Button
            aria-label={isVisible ? hidePasswordLabel : showPasswordLabel}
            className="inline-flex h-8 w-8 items-center justify-center rounded-button text-foreground-secondary transition-colors hover:text-foreground-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active"
            onClick={() => setIsVisible((visible) => !visible)}
          >
            <Icon
              className="h-4 w-4"
              decorative
              icon={isVisible ? "eye-slash" : "eye"}
            />
          </Button>
        }
        type={isVisible ? "text" : "password"}
      />
    );
  },
);

PasswordTextInput.displayName = "PasswordTextInput";
