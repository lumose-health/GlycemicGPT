import type { ReactNode } from "react";

export type ConfirmationTone = "default" | "destructive";

export interface ConfirmationRequest {
  cancelLabel?: string;
  confirmLabel?: string;
  description: ReactNode;
  title: string;
  tone?: ConfirmationTone;
}

export interface ConfirmationContextValue {
  confirm: (request: ConfirmationRequest) => Promise<boolean>;
}

export interface ConfirmationProviderProps {
  children: ReactNode;
}
