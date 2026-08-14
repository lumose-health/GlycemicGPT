"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/base";
import { HighlightButton } from "@/components/HighlightButton";
import { SecondaryButton } from "@/components/SecondaryButton";

import type {
  ConfirmationContextValue,
  ConfirmationProviderProps,
  ConfirmationRequest,
} from "./ConfirmationProvider.types";

const ConfirmationContext = createContext<ConfirmationContextValue | null>(
  null,
);

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function ConfirmationProvider({ children }: ConfirmationProviderProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const [request, setRequest] = useState<ConfirmationRequest | null>(null);

  const closeConfirmation = useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setRequest(null);
  }, []);

  const confirm = useCallback((nextRequest: ConfirmationRequest) => {
    resolverRef.current?.(false);
    triggerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setRequest(nextRequest);

    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  useEffect(() => {
    return () => {
      resolverRef.current?.(false);
    };
  }, []);

  useEffect(() => {
    if (!request) return;

    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    document.body.style.overflow = "hidden";

    const focusFrame = window.requestAnimationFrame(() => {
      cancelButtonRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeConfirmation(false);
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);

      if (!firstElement || !lastElement) {
        event.preventDefault();
        return;
      }

      if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault();
        firstElement.focus();
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [closeConfirmation, request]);

  const contextValue = useMemo<ConfirmationContextValue>(
    () => ({ confirm }),
    [confirm],
  );

  const handleBackdropMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      closeConfirmation(false);
    }
  };

  return (
    <ConfirmationContext.Provider value={contextValue}>
      {children}
      {request
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-overlay-primary p-4 backdrop-blur-sm"
              data-testid="confirmation-overlay"
              onMouseDown={handleBackdropMouseDown}
            >
              <div
                aria-describedby={descriptionId}
                aria-labelledby={titleId}
                aria-modal="true"
                className="w-full max-w-md rounded-panel border border-border-default bg-surface-primary p-5 text-foreground-primary shadow-2xl sm:p-6"
                ref={dialogRef}
                role="alertdialog"
              >
                <h2
                  className="font_poppins font_header_3 text-foreground-primary"
                  id={titleId}
                >
                  {request.title}
                </h2>
                <div
                  className="font_poppins font_body_2 mt-3 text-foreground-secondary"
                  id={descriptionId}
                >
                  {request.description}
                </div>
                <div className="mt-6 flex flex-wrap items-center justify-start gap-3">
                  <SecondaryButton
                    className="font_poppins h-10 px-4 font_body_2"
                    onClick={() => closeConfirmation(false)}
                    ref={cancelButtonRef}
                  >
                    <Icon decorative icon="x" />
                    {request.cancelLabel ?? "Cancel"}
                  </SecondaryButton>
                  <HighlightButton
                    className="font_poppins"
                    onClick={() => closeConfirmation(true)}
                  >
                    <Icon
                      className="h-4 w-4"
                      decorative
                      icon={
                        request.tone === "destructive"
                          ? "trash"
                          : "circle-check"
                      }
                    />
                    {request.confirmLabel ?? "Confirm"}
                  </HighlightButton>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </ConfirmationContext.Provider>
  );
}

export function useConfirmation(): ConfirmationContextValue {
  const context = useContext(ConfirmationContext);

  if (!context) {
    throw new Error(
      "useConfirmation must be used within a ConfirmationProvider",
    );
  }

  return context;
}
