"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { Icon } from "@/base/Icon";
import { twMerge } from "@/lib/ui/twMerge";
import type { SettingsTabItem, SettingsTabsProps } from "./SettingsTabs.types";

function getNextIndex(currentIndex: number, key: string, itemCount: number) {
  if (key === "ArrowRight") return (currentIndex + 1) % itemCount;
  if (key === "ArrowLeft") {
    return (currentIndex - 1 + itemCount) % itemCount;
  }
  if (key === "Home") return 0;
  if (key === "End") return itemCount - 1;
  return null;
}

export function SettingsTabs<T extends string>({
  "aria-label": ariaLabel,
  className,
  idPrefix,
  items,
  value,
}: SettingsTabsProps<T>) {
  const router = useRouter();
  const linksRef = useRef<Array<HTMLAnchorElement | null>>([]);

  useEffect(() => {
    const selectedIndex = items.findIndex((item) => item.value === value);
    linksRef.current[selectedIndex]?.scrollIntoView?.({
      block: "nearest",
      inline: "nearest",
    });
  }, [items, value]);

  function handleKeyDown(
    event: KeyboardEvent<HTMLAnchorElement>,
    item: SettingsTabItem<T>,
  ) {
    const currentIndex = items.findIndex(
      (candidate) => candidate.value === item.value,
    );
    const nextIndex = getNextIndex(currentIndex, event.key, items.length);

    if (nextIndex === null) return;

    event.preventDefault();
    const nextItem = items[nextIndex];
    router.push(nextItem.href);
    linksRef.current[nextIndex]?.focus();
  }

  return (
    <div
      aria-label={ariaLabel}
      className={twMerge(
        "flex w-full gap-1 overflow-x-auto rounded-panel border border-border-default bg-surface-elevated p-1 sm:w-fit",
        className,
      )}
      role="tablist"
    >
      {items.map((item, index) => {
        const selected = item.value === value;

        return (
          <Link
            aria-controls={`${idPrefix}-panel-${item.value}`}
            aria-selected={selected}
            className={twMerge(
              "font_poppins font_body_3 inline-flex min-h-10 shrink-0 items-center gap-2 rounded-button px-4 transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active",
              selected
                ? "bg-accent text-accent-foreground"
                : "text-foreground-secondary hover:bg-surface-secondary hover:text-foreground-primary",
            )}
            href={item.href}
            id={`${idPrefix}-tab-${item.value}`}
            key={item.value}
            onKeyDown={(event) => handleKeyDown(event, item)}
            ref={(node) => {
              linksRef.current[index] = node;
            }}
            role="tab"
            tabIndex={selected ? 0 : -1}
          >
            {item.icon ? (
              <Icon className="h-5 w-5" decorative icon={item.icon} />
            ) : null}
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
