import { z } from "zod";

export const nightscoutConnectionSchema = z.object({
  baseUrl: z
    .string()
    .trim()
    .min(1, "Nightscout URL is required")
    .url("Enter a valid Nightscout URL"),
  name: z.string().trim().min(1, "Name is required"),
});

export type NightscoutConnectionFields = z.infer<
  typeof nightscoutConnectionSchema
>;
