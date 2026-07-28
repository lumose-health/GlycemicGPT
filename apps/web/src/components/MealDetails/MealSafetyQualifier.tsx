import { twMerge } from "@/lib/ui/twMerge";

export function MealSafetyQualifier({
  className,
  qualifier,
  testId = "meal-safety-qualifier",
}: {
  className?: string;
  qualifier: string;
  testId?: string;
}) {
  return (
    <div
      className={twMerge(
        "font_poppins font_body_4 rounded-panel border border-signal-warning-text bg-surface-primary px-3 py-2 text-signal-warning-text",
        className,
      )}
      data-testid={testId}
      role="note"
    >
      <span className="font_metric_label">Safety note</span>{" "}
      {qualifier}
    </div>
  );
}
