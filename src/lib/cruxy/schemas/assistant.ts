import { z } from "zod";
import { citedClaimSchema } from "@/lib/cruxy/schemas/common";

export const assistantSchema = z.object({
  question_first: z.string().nullable(),
  answer: z.string().nullable(),
  quiet: z.boolean().default(false),
  claims: z.array(citedClaimSchema).default([]),
});

export type AssistantOutput = z.infer<typeof assistantSchema>;
