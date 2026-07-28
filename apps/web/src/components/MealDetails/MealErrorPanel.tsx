import { ActionLink } from "@/components/ActionLink";
import { FeedbackMessage } from "@/components/FeedbackMessage";
import type { MealErrorInfo } from "@/lib/meal-errors";

function getCanonicalSettingsHref(href: string) {
  if (href === "/dashboard/settings/ai-provider") return "/settings/ai";
  return href;
}

export function MealErrorPanel({
  info,
  onDismiss,
}: {
  info: MealErrorInfo;
  onDismiss?: () => void;
}) {
  if (info.retryable) {
    return (
      <FeedbackMessage
        actionLabel={onDismiss ? "Dismiss" : undefined}
        data-testid="meal-error"
        message={info.message}
        onAction={onDismiss}
        title={info.title}
        variant="error"
      />
    );
  }

  return (
    <section
      className="space-y-3 rounded-panel border border-signal-warning-text bg-surface-primary p-5"
      data-testid={`meal-${info.kind.replace(/_/g, "-")}`}
      role="alert"
    >
      <h2 className="font_poppins font_header_4 text-signal-warning-text">
        {info.title}
      </h2>
      <p className="font_poppins font_body_2 text-foreground-primary">
        {info.message}
      </p>
      {info.settingsHref ? (
        <ActionLink
          href={getCanonicalSettingsHref(info.settingsHref)}
          variant="secondary"
        >
          Open Settings
        </ActionLink>
      ) : null}
    </section>
  );
}
