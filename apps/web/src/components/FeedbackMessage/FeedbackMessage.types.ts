import type { HTMLAttributes, ReactNode } from "react";

export type FeedbackMessageVariant =
  | "error"
  | "offline"
  | "success"
  | "warning";

export type FeedbackMessageProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "title"
> & {
  actionDisabled?: boolean;
  actionLabel?: ReactNode;
  message: ReactNode;
  onAction?: () => void;
  title?: ReactNode;
  variant: FeedbackMessageVariant;
};
