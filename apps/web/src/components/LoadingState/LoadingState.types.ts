import type { HTMLAttributes, ReactNode } from "react";

export type LoadingStateProps = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
};
