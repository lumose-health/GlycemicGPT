"use client";

import { useId, useState } from "react";
import { Button, Icon } from "@/base";
import { twMerge } from "@/lib/ui/twMerge";
import type { AccordionProps } from "./Accordion.types";

export function Accordion({
  children,
  className,
  contentClassName,
  defaultOpen = false,
  onOpenChange,
  open,
  trigger,
  triggerClassName,
}: AccordionProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const generatedId = useId();
  const isOpen = open ?? uncontrolledOpen;
  const contentId = `${generatedId}-content`;
  const triggerId = `${generatedId}-trigger`;

  const handleToggle = () => {
    const nextOpen = !isOpen;

    if (open === undefined) {
      setUncontrolledOpen(nextOpen);
    }

    onOpenChange?.(nextOpen);
  };

  return (
    <div
      className={twMerge(
        "overflow-hidden rounded-panel border border-border-default bg-surface-elevated",
        className,
      )}
    >
      <Button
        aria-controls={contentId}
        aria-expanded={isOpen}
        className={twMerge(
          "flex w-full cursor-pointer items-center justify-between bg-surface-secondary text-left text-foreground-primary",
          "focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-active",
          isOpen && "border-b border-border-default",
          triggerClassName,
        )}
        id={triggerId}
        onClick={handleToggle}
      >
        <div className="min-w-0 flex-1">{trigger}</div>
        <Icon
          className={twMerge(
            "ml-4 h-5 w-5 shrink-0 text-foreground-secondary transition-transform duration-300 ease-in-out motion-reduce:transition-none",
            isOpen ? "-rotate-90" : "rotate-90",
          )}
          decorative
          icon="chevron"
        />
      </Button>

      <div
        aria-hidden={!isOpen}
        aria-labelledby={triggerId}
        className={twMerge(
          "grid bg-surface-elevated text-foreground-primary transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
        id={contentId}
        inert={!isOpen}
        role="region"
      >
        <div className="min-h-0 overflow-hidden">
          <div className={contentClassName}>{children}</div>
        </div>
      </div>
    </div>
  );
}
