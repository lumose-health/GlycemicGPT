import { Icon } from "@/base";
import { twMerge } from "@/lib/ui/twMerge";
import type { EmptyStateProps } from "./EmptyState.types";

export function EmptyState({
  action,
  className,
  description,
  icon,
  title,
  ...props
}: EmptyStateProps) {
  return (
    <section
      {...props}
      className={twMerge(
        "flex min-h-72 flex-col items-center justify-center rounded-panel border border-border-default bg-surface-elevated px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-pill bg-surface-secondary text-foreground-primary">
          <Icon className="h-7 w-7" decorative icon={icon} />
        </span>
      ) : null}
      <h2 className="font_poppins font_header_3 text-foreground-primary">
        {title}
      </h2>
      <p className="font_poppins font_body_2 mt-2 max-w-lg text-foreground-primary">
        {description}
      </p>
      {action ? <div className="mt-6">{action}</div> : null}
    </section>
  );
}
