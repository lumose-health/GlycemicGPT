import { Icon } from "@/base";

export function MealPhotoPlaceholder({
  size = "sm",
}: {
  size?: "sm" | "lg";
}) {
  const dimensions = size === "lg" ? "h-56 w-full" : "h-16 w-16";
  const iconSize = size === "lg" ? "h-9 w-9" : "h-5 w-5";

  return (
    <div
      aria-hidden="true"
      className={`${dimensions} flex shrink-0 items-center justify-center rounded-panel bg-surface-secondary text-foreground-primary`}
      data-testid="meal-photo-placeholder"
    >
      <Icon className={iconSize} decorative icon="fork-knife" />
    </div>
  );
}
