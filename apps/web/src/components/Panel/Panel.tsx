import { forwardRef, useId, type Ref } from "react";
import { twMerge } from "@/lib/ui/twMerge";
import type { PanelProps } from "./Panel.types";

const HEADING_TAG_BY_LEVEL = {
  2: "h2",
  3: "h3",
  4: "h4",
} as const;

export const Panel = forwardRef<HTMLElement, PanelProps>(
  (
    {
      bodyClassName,
      children,
      className,
      headerClassName,
      heading,
      headingClassName,
      headingId,
      headingLevel = 2,
      subheading,
      subheadingClassName,
      "aria-labelledby": ariaLabelledBy,
      ...props
    }: PanelProps,
    ref: Ref<HTMLElement>,
  ) => {
    const generatedId = useId();
    const resolvedHeadingId = headingId ?? `${generatedId}-heading`;
    const HeadingTag = HEADING_TAG_BY_LEVEL[headingLevel];

    return (
      <section
        {...props}
        aria-labelledby={ariaLabelledBy ?? resolvedHeadingId}
        className={twMerge(
          "overflow-hidden rounded-panel border border-border-default bg-surface-elevated",
          className,
        )}
        ref={ref}
      >
        <header
          className={twMerge(
            "border-b border-border-default bg-surface-secondary px-4 py-3 text-foreground-primary",
            headerClassName,
          )}
        >
          <HeadingTag
            className={twMerge(
              "font_poppins font_header_4 text-foreground-primary",
              headingClassName,
            )}
            id={resolvedHeadingId}
          >
            {heading}
          </HeadingTag>
          {subheading ? (
            <p
              className={twMerge(
                "mt-1 font_poppins font_body_3 text-foreground-primary",
                subheadingClassName,
              )}
            >
              {subheading}
            </p>
          ) : null}
        </header>
        <div
          className={twMerge(
            "bg-surface-elevated p-4 text-foreground-primary",
            bodyClassName,
          )}
        >
          {children}
        </div>
      </section>
    );
  },
);

Panel.displayName = "Panel";
