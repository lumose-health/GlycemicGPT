import { z } from "zod";

export const briefDeliverySchema = z.object({
  channel: z.enum(["web_only", "telegram", "both"]),
  deliveryTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid delivery time"),
  enabled: z.boolean(),
  timezone: z.string().trim().min(1, "Select a timezone"),
});

export type BriefDeliveryFields = z.infer<typeof briefDeliverySchema>;
