"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { Button, Icon } from "@/base";
import type { IconName } from "@/base/Icon/iconConfig";
import { twMerge } from "@/lib/ui/twMerge";
import { useTheme } from "@/providers";
import { SYSTEM_THEME, themeOptions, type ThemeMode } from "@/providers/theme-config";
import type { ThemeSwitcherProps } from "./ThemeSwitcher.types";

function getNextCompositeIndex(
  currentIndex: number,
  itemCount: number,
  key: string,
): number | null {
  if (key === "ArrowRight" || key === "ArrowDown") {
    return (currentIndex + 1) % itemCount;
  }

  if (key === "ArrowLeft" || key === "ArrowUp") {
    return (currentIndex - 1 + itemCount) % itemCount;
  }

  if (key === "Home") {
    return 0;
  }

  if (key === "End") {
    return itemCount - 1;
  }

  return null;
}

function focusElementById(id: string) {
  window.requestAnimationFrame(() => {
    document.getElementById(id)?.focus();
  });
}

export function ThemeSwitcher({
  className,
  idPrefix = "theme-switcher",
}: ThemeSwitcherProps) {
  const { resolvedTheme, setTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const selectedTheme: ThemeMode = mounted
    ? theme === SYSTEM_THEME
      ? resolvedTheme
      : theme
    : "dark";

  function handleThemeKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    value: ThemeMode,
  ) {
    const currentIndex = themeOptions.findIndex((option) => option.value === value);
    const nextIndex = getNextCompositeIndex(
      currentIndex,
      themeOptions.length,
      event.key,
    );

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();

    const nextTheme = themeOptions[nextIndex].value;
    setTheme(nextTheme);
    focusElementById(`${idPrefix}-${nextTheme}`);
  }

  return (
    <div
      aria-label="Theme selection"
      className={twMerge(
        "flex flex-col gap-[6px]",
        className,
      )}
      role="radiogroup"
    >
      {themeOptions.map((option) => {
        const isSelected = selectedTheme === option.value;

        return (
          <Button
            aria-checked={isSelected}
            ariaLabel={option.ariaLabel}
            className={twMerge(
              "group relative inline-flex h-9 w-16 cursor-pointer items-center justify-center overflow-hidden rounded-panel transition-colors",
              "text-foreground-secondary hover:bg-surface-elevated hover:text-foreground-primary",
              "focus-visible:ring-2 focus-visible:ring-border-active",
              isSelected &&
                "bg-surface-elevated text-foreground-primary hover:bg-surface-elevated hover:text-foreground-primary",
            )}
            id={`${idPrefix}-${option.value}`}
            key={option.value}
            onKeyDown={(event) => handleThemeKeyDown(event, option.value)}
            onClick={() => setTheme(option.value)}
            role="radio"
            tabIndex={isSelected ? 0 : -1}
            title={`${option.label} theme`}
          >
            <span
              aria-hidden="true"
              className={twMerge(
                "absolute left-2 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-accent transition-opacity",
                isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
              )}
            />
            <span
              aria-hidden="true"
              className={twMerge(
                "absolute inset-y-1 left-1 w-8 rounded-full bg-accent opacity-0 blur-xl transition-opacity",
                isSelected ? "opacity-25" : "group-hover:opacity-20",
              )}
            />
            <Icon
              decorative
              icon={option.icon as IconName}
              className="relative h-5 w-5"
            />
            {option.badge ? (
              <span className="font_metric_caption absolute right-3 top-1/2 -translate-y-1/2">
                {option.badge}
              </span>
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}
