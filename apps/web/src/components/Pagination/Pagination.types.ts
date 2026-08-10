import type { HTMLAttributes } from "react";

export type PaginationProps = HTMLAttributes<HTMLElement> & {
  disabled?: boolean;
  onNext: () => void;
  onPrevious: () => void;
  page: number;
  totalPages: number;
};
