import { useRef } from "react";
import { Button } from "@/base";
import { twMerge } from "@/lib/ui/twMerge";
import type {
  SegmentedControlOption,
  SegmentedControlProps,
} from "./SegmentedControl.types";

function getNextIndex(
  currentIndex: number,
  key: string,
  optionCount: number,
) {
  if (key === "ArrowRight") return (currentIndex + 1) % optionCount;
  if (key === "ArrowLeft") {
    return (currentIndex - 1 + optionCount) % optionCount;
  }
  if (key === "Home") return 0;
  if (key === "End") return optionCount - 1;
  return null;
}

export function SegmentedControl<T extends string>({
  "aria-label": ariaLabel,
  className,
  onChange,
  options,
  value,
}: SegmentedControlProps<T>) {
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);

  const selectOption = (
    option: SegmentedControlOption<T>,
    index: number,
  ) => {
    if (option.disabled) return;
    onChange(option.value);
    buttonsRef.current[index]?.focus();
  };

  return (
    <div
      aria-label={ariaLabel}
      className={twMerge(
        "inline-flex flex-wrap gap-1 rounded-panel border border-border-default bg-surface-elevated p-1",
        className,
      )}
      role="tablist"
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <Button
            aria-selected={selected}
            className={twMerge(
              "font_poppins font_body_3 inline-flex min-h-9 items-center gap-2 rounded-button px-3 transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active",
              selected
                ? "bg-accent text-accent-foreground"
                : "text-foreground-secondary hover:bg-surface-secondary hover:text-foreground-primary",
              option.disabled && "cursor-not-allowed opacity-50",
            )}
            disabled={option.disabled}
            key={option.value}
            onClick={() => selectOption(option, index)}
            onKeyDown={(event) => {
              const nextIndex = getNextIndex(
                index,
                event.key,
                options.length,
              );
              if (nextIndex === null) return;
              event.preventDefault();
              selectOption(options[nextIndex], nextIndex);
            }}
            ref={(node) => {
              buttonsRef.current[index] = node;
            }}
            role="tab"
            tabIndex={selected ? 0 : -1}
          >
            <span>{option.label}</span>
            {option.meta ? (
              <span className="font_metric_caption">{option.meta}</span>
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}
