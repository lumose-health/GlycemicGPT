import { Accordion } from "@/components/Accordion";
import { Icon, type IconName } from "@/base/Icon";
import { twMerge } from "@/lib/ui/twMerge";

interface ConnectionCollapsibleSectionProps {
  title: string;
  iconName?: IconName;
  headerContent?: React.ReactNode;
  defaultOpen?: boolean;
  variant?: "section" | "subsection";
  badge?: React.ReactNode;
  children: React.ReactNode;
}

export function ConnectionCollapsibleSection({
  title,
  iconName,
  headerContent,
  defaultOpen = true,
  variant = "section",
  badge,
  children,
}: ConnectionCollapsibleSectionProps) {
  const isSection = variant === "section";

  return (
    <Accordion
      contentClassName={isSection ? "px-6 pb-6 pt-6" : "px-4 pb-4 pt-4"}
      defaultOpen={defaultOpen}
      trigger={
        headerContent ? (
          headerContent
        ) : (
          <div className="flex items-center gap-3">
            {iconName && isSection ? (
              <div className="rounded-panel bg-surface-elevated p-2">
                <Icon
                  className="h-5 w-5 text-foreground-primary"
                  decorative
                  icon={iconName}
                />
              </div>
            ) : iconName ? (
              <Icon
                className="h-5 w-5 text-foreground-primary"
                decorative
                icon={iconName}
              />
            ) : null}
            <span
              className={twMerge(
                isSection
                  ? "font_header_4 text-foreground-primary"
                  : "font_body_2 text-foreground-primary",
              )}
            >
              {title}
            </span>
            {badge}
          </div>
        )
      }
      triggerClassName={isSection ? "px-6 py-4" : "px-4 py-3"}
    >
      {children}
    </Accordion>
  );
}
