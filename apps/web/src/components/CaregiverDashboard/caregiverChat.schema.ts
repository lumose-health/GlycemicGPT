import { z } from "zod";

export const caregiverChatSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Enter a question")
    .max(2000, "Question must be 2,000 characters or fewer"),
});
