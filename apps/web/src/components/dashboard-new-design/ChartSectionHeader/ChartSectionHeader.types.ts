import type { ReactNode } from "react";

export interface ChartSectionHeaderProps {
  className?: string;
  details?: ReactNode;
  heading: ReactNode;
  message?: ReactNode;
  separator?: boolean;
  unit?: ReactNode;
}
