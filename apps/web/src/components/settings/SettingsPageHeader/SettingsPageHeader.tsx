import { Icon } from "@/base";
import { twMerge } from "@/lib/ui/twMerge";
import type { SettingsPageHeaderProps } from "./SettingsPageHeader.types";

export function SettingsPageHeader({
  className,
  description,
  icon,
  title,
  ...props
}: SettingsPageHeaderProps) {
  return (
    <header
      {...props}
      className={twMerge(icon && "flex items-start gap-4", className)}
    >
      {icon ? (
        <Icon
          className="h-20 w-20 text-accent"
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
    </header>
  );
}
