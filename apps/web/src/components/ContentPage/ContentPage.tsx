import { twMerge } from "@/lib/ui/twMerge";
import type { ContentPageProps } from "./ContentPage.types";

export function ContentPage({ className, ...props }: ContentPageProps) {
  return (
    <div
      {...props}
      className={twMerge(
        "mx-auto w-full max-w-5xl space-y-8 py-6 lg:py-8",
        className,
      )}
    />
  );
}
