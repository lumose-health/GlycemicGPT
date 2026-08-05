import { useId } from "react";
import { twMerge } from "@/lib/ui/twMerge";
import type { SettingsSectionProps } from "./SettingsSection.types";

export function SettingsSection({
  children,
  className,
  description,
  descriptionClassName,
  headingId,
  headingRef,
  headingTabIndex,
  separated = false,
  title,
  ...props
}: SettingsSectionProps) {
  const generatedId = useId();
  const titleId = headingId ?? generatedId;

  return (
    <section
      {...props}
      aria-labelledby={titleId}
      className={twMerge(
        "space-y-6",
        separated &&
          "relative before:absolute before:-top-6 before:inset-x-0 before:border-t before:border-border-default before:content-['']",
        className,
      )}
    >
      <div className="space-y-2">
        <h2
          className="font_poppins font_header_3 text-foreground-primary"
          id={titleId}
          ref={headingRef}
          tabIndex={headingTabIndex}
        >
          {title}
        </h2>
        {description ? (
          <p
            className={twMerge(
              "font_body_3 max-w-2xl text-foreground-secondary",
              descriptionClassName,
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
