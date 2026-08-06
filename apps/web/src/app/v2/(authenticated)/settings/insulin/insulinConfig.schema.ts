import { z } from "zod";
import { INSULIN_LIMITS } from "@/lib/insulin";

export const insulinConfigSchema = z.object({
  diaHours: z.coerce
    .number<number>()
    .min(
      INSULIN_LIMITS.diaMinHours,
      `DIA must be at least ${INSULIN_LIMITS.diaMinHours} hours`,
    )
    .max(
      INSULIN_LIMITS.diaMaxHours,
      `DIA must be at most ${INSULIN_LIMITS.diaMaxHours} hours`,
    ),
  insulinType: z.string().trim().min(1, "Select an insulin type"),
  onsetMinutes: z.coerce
    .number<number>()
    .min(
      INSULIN_LIMITS.onsetMinMinutes,
      `Onset must be at least ${INSULIN_LIMITS.onsetMinMinutes} minute`,
    )
    .max(
      INSULIN_LIMITS.onsetMaxMinutes,
      `Onset must be at most ${INSULIN_LIMITS.onsetMaxMinutes} minutes`,
    ),
});

export type InsulinConfigFields = z.infer<typeof insulinConfigSchema>;
