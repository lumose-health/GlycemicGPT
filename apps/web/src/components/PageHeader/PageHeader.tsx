import { Icon } from "@/base";
import { twMerge } from "@/lib/ui/twMerge";
import type { PageHeaderProps } from "./PageHeader.types";

export function PageHeader({
  actions,
  className,
  description,
  icon,
  title,
  ...props
}: PageHeaderProps) {
  return (
    <header
      {...props}
      className={twMerge(
        "flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-4">
        {icon ? (
          <Icon
            className="h-20 w-20 shrink-0 text-accent"
            decorative
            icon={icon}
          />
        ) : null}
        <div className="min-w-0 space-y-2">
          <h1 className="font_poppins font_header_1 text-foreground-primary">
            {title}
          </h1>
          <p className="font_poppins font_body_2 max-w-2xl text-foreground-secondary">
            {description}
          </p>
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
