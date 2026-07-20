"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { Button, Icon } from "@/base";
import type { IconName } from "@/base/Icon/iconConfig";
import { twMerge } from "@/lib/ui/twMerge";
import { useTheme } from "@/providers";
import {
  additionalThemeOptions,
  primaryThemeOptions,
  settingsThemeOptions,
  SYSTEM_THEME,
  themeOptions,
  type ThemeChoice,
} from "@/providers/theme-config";
import { ThemePreview } from "./ThemePreview";
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
  variant = "navigation",
}: ThemeSwitcherProps) {
  const { resolvedTheme, setTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const selectedTheme: ThemeChoice = mounted
    ? variant === "settings"
      ? theme
      : theme === SYSTEM_THEME
        ? resolvedTheme
        : theme
    : variant === "settings"
      ? SYSTEM_THEME
      : "dark";

  const activeOptions =
    variant === "settings" ? settingsThemeOptions : themeOptions;

  function handleThemeKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    value: ThemeChoice,
  ) {
    const currentIndex = activeOptions.findIndex(
      (option) => option.value === value,
    );
    const nextIndex = getNextCompositeIndex(
      currentIndex,
      activeOptions.length,
      event.key,
    );

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();

    const nextTheme = activeOptions[nextIndex].value;
    setTheme(nextTheme);
    focusElementById(`${idPrefix}-${nextTheme}`);
  }

  function renderSettingsOption(option: (typeof settingsThemeOptions)[number]) {
    const isSelected = selectedTheme === option.value;

    return (
      <Button
        aria-checked={isSelected}
        ariaLabel={option.ariaLabel}
        className="group flex min-w-0 cursor-pointer flex-col gap-2 rounded-panel text-foreground-primary outline-hidden focus-visible:ring-2 focus-visible:ring-border-active focus-visible:ring-offset-2 focus-visible:ring-offset-surface-page sm:gap-3"
        id={`${idPrefix}-${option.value}`}
        key={option.value}
        onKeyDown={(event) => handleThemeKeyDown(event, option.value)}
        onClick={() => setTheme(option.value)}
        role="radio"
        tabIndex={isSelected ? 0 : -1}
        title={`${option.label} theme`}
      >
        <span
          className={twMerge(
            "relative w-full overflow-hidden rounded-panel border border-border-default transition-colors group-hover:border-border-hover",
            isSelected &&
              "border-border-active ring-1 ring-border-active group-hover:border-border-active",
          )}
        >
          <ThemePreview theme={option.value} />
          {isSelected ? (
            <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-foreground sm:right-3 sm:top-3 sm:h-6 sm:w-6">
              <Icon decorative icon="check" className="h-3 w-3 sm:h-4 sm:w-4" />
            </span>
          ) : null}
        </span>
        <span
          className={twMerge(
            "font_nav_link text-foreground-secondary",
            isSelected && "text-foreground-primary",
          )}
        >
          {option.label}
        </span>
      </Button>
    );
  }

  if (variant === "settings") {
    return (
      <div
        aria-label="Theme selection"
        className={twMerge("space-y-8", className)}
        role="radiogroup"
      >
        <div className="grid grid-cols-3 gap-3 sm:gap-5">
          {primaryThemeOptions.map(renderSettingsOption)}
        </div>

        <div className="space-y-6">
          <div className="border-t border-border-default" role="separator" />
          <h3 className="font_poppins font_header_4 text-foreground-primary">
            Additional themes
          </h3>
          <div className="grid grid-cols-3 gap-3 sm:gap-5">
            {additionalThemeOptions.map(renderSettingsOption)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      aria-label="Theme selection"
      className={twMerge("flex flex-col gap-[6px]", className)}
      role="radiogroup"
    >
      {themeOptions.map((option) => {
        const isSelected = selectedTheme === option.value;

        return (
          <Button
            aria-checked={isSelected}
            ariaLabel={option.ariaLabel}
            className={twMerge(
              "group relative inline-flex h-9 w-16 cursor-pointer items-center justify-center overflow-hidden rounded-panel text-foreground-secondary transition-colors hover:bg-surface-elevated hover:text-foreground-primary",
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
                isSelected
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100",
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
