import type { ReactNode } from "react";

export type AccordionProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  open?: boolean;
  trigger: ReactNode;
  triggerClassName?: string;
};
