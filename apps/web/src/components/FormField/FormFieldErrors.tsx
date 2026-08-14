"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type TransitionEvent,
} from "react";
import { twMerge } from "@/lib/ui/twMerge";

interface FormFieldErrorsProps {
  errors: readonly ReactNode[];
  inputId: string;
}

interface FormFieldErrorMessageProps {
  children: ReactNode;
  isPresent: boolean;
  onExited: () => void;
}

interface RenderedError {
  id: number;
  isPresent: boolean;
  key: number | string;
  message: ReactNode;
}

function FormFieldErrorMessage({
  children,
  isPresent,
  onExited,
}: FormFieldErrorMessageProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!isPresent) {
      setIsVisible(false);
      return;
    }

    const animationFrame = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(animationFrame);
  }, [isPresent]);

  const handleTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (!isPresent && event.propertyName === "grid-template-rows") {
      event.stopPropagation();
      onExited();
    }
  };

  return (
    <li aria-hidden={!isPresent}>
      <div
        className={twMerge(
          "grid transition-[grid-template-rows,opacity,translate] duration-300 ease-in-out motion-reduce:transition-none",
          isVisible
            ? "grid-rows-[1fr] translate-y-0 opacity-100"
            : "grid-rows-[0fr] -translate-y-2 opacity-0",
        )}
        onTransitionEnd={handleTransitionEnd}
      >
        <div className="min-h-0 overflow-visible">{children}</div>
      </div>
    </li>
  );
}

function getErrorKey(
  error: ReactNode,
  index: number,
  errors: readonly ReactNode[],
) {
  if (typeof error === "string" || typeof error === "number") {
    const occurrence = errors
      .slice(0, index)
      .filter((candidate) => Object.is(candidate, error)).length;

    return `${typeof error}:${error}:${occurrence}`;
  }

  return index;
}

function reconcileErrors(
  currentErrors: readonly RenderedError[],
  nextErrors: readonly ReactNode[],
  getNextId: () => number,
): RenderedError[] {
  const matchedIds = new Set<number>();
  const nextRenderedErrors = nextErrors.map((message, index) => {
    const key = getErrorKey(message, index, nextErrors);
    const existingError = currentErrors.find(
      (error) => error.key === key && !matchedIds.has(error.id),
    );

    if (existingError) {
      matchedIds.add(existingError.id);
      return {
        ...existingError,
        isPresent: true,
        message,
      };
    }

    const newError = {
      id: getNextId(),
      isPresent: true,
      key,
      message,
    };
    matchedIds.add(newError.id);
    return newError;
  });

  currentErrors.forEach((error, index) => {
    if (matchedIds.has(error.id)) return;

    nextRenderedErrors.splice(Math.min(index, nextRenderedErrors.length), 0, {
      ...error,
      isPresent: false,
    });
  });

  return nextRenderedErrors;
}

export function FormFieldErrors({
  errors,
  inputId,
}: FormFieldErrorsProps) {
  const nextErrorId = useRef(0);
  const [renderedErrors, setRenderedErrors] =
    useState<readonly RenderedError[]>(() =>
      errors.map((message, index) => ({
        id: nextErrorId.current++,
        isPresent: true,
        key: getErrorKey(message, index, errors),
        message,
      })),
    );
  const [isVisible, setIsVisible] = useState(errors.length > 0);

  useEffect(() => {
    if (errors.length > 0) {
      setRenderedErrors((currentErrors) =>
        reconcileErrors(currentErrors, errors, () => nextErrorId.current++),
      );
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [errors]);

  const handleTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (
      !isVisible &&
      event.target === event.currentTarget &&
      event.propertyName === "grid-template-rows"
    ) {
      setRenderedErrors([]);
    }
  };

  return (
    <div
      aria-hidden={!isVisible}
      className={twMerge(
        "-mt-1.5 grid transition-[grid-template-rows,opacity,translate] duration-300 ease-in-out motion-reduce:transition-none",
        isVisible
          ? "grid-rows-[1fr] translate-y-0 opacity-100"
          : "grid-rows-[0fr] -translate-y-2 opacity-0",
      )}
      onTransitionEnd={handleTransitionEnd}
    >
      <div className="min-h-0 overflow-visible">
        <div className="pt-1.5">
          {renderedErrors.length > 0 ? (
            <ul
              aria-live="polite"
              className={twMerge(
                "font_body_3 grid transition-[gap,padding] duration-300 ease-in-out motion-reduce:transition-none text-signal-error-text",
                renderedErrors.filter((error) => error.isPresent).length > 1
                  ? "list-disc gap-1 pl-5"
                  : "list-none gap-0 pl-0",
              )}
              id={`${inputId}-error`}
              role="alert"
            >
              {renderedErrors.map((error) => (
                <FormFieldErrorMessage
                  isPresent={error.isPresent}
                  key={error.id}
                  onExited={() =>
                    setRenderedErrors((currentErrors) =>
                      currentErrors.filter(
                        (currentError) => currentError.id !== error.id,
                      ),
                    )
                  }
                >
                  {error.message}
                </FormFieldErrorMessage>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}
