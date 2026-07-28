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
  if (totalPages <= 1) return null;

  return (
    <nav
      {...props}
      aria-label="Pagination"
      className={twMerge(
        "flex items-center justify-center gap-3",
        className,
      )}
    >
      <SecondaryButton
        disabled={disabled || page <= 1}
        onClick={onPrevious}
      >
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
