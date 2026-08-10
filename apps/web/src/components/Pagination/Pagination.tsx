"use client";

import { useLayoutEffect, useRef } from "react";

import { SecondaryButton } from "@/components/SecondaryButton";
import { twMerge } from "@/lib/ui/twMerge";

import type { PaginationProps } from "./Pagination.types";

export function Pagination({
  className,
  disabled = false,
  onNext,
  onPrevious,
  page,
  totalPages,
  ...props
}: PaginationProps) {
  const navigationRef = useRef<HTMLElement>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const previousPaginationRef = useRef({ page, totalPages });

  useLayoutEffect(() => {
    if (navigationRef.current) {
      scrollContainerRef.current = navigationRef.current.closest<HTMLElement>(
        "[data-dashboard-scroll-container]",
      );
    }

    const previousPagination = previousPaginationRef.current;
    if (
      previousPagination.page === page &&
      previousPagination.totalPages === totalPages
    ) {
      return;
    }

    previousPaginationRef.current = { page, totalPages };
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [page, totalPages]);

  if (totalPages <= 1) return null;

  return (
    <nav
      {...props}
      aria-label="Pagination"
      ref={navigationRef}
      className={twMerge("flex items-center justify-center gap-3", className)}
    >
      <SecondaryButton disabled={disabled || page <= 1} onClick={onPrevious}>
        Previous
      </SecondaryButton>
      <span className="font_poppins font_body_3 text-foreground-secondary">
        Page {page} of {totalPages}
      </span>
      <SecondaryButton
        disabled={disabled || page >= totalPages}
        onClick={onNext}
      >
        Next
      </SecondaryButton>
    </nav>
  );
}
