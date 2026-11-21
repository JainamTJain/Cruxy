import { z } from "zod";
import { citedClaimSchema } from "@/lib/cruxy/schemas/common";

export const coachCardsSchema = z.object({
  question_first: z.string().nullable(),
  plain_sentence: z.string().optional().nullable(),
  analogies: z.array(z.string()).default([]),
  vivid_example: z.string().optional().nullable(),
  phrases_to_avoid: z.array(z.string()).default([]),
  flashcards: z
    .array(
      z.object({
        front: z.string(),
        back: z.string(),
        citation_ids: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  claims: z.array(citedClaimSchema).default([]),
});

export const coachSocraticSchema = z.object({
  question: z.string(),
  hint: z.string().optional().nullable(),
  full_answer: z.string().optional().nullable(),
  claims: z.array(citedClaimSchema).default([]),
});

export type CoachCardsOutput = z.infer<typeof coachCardsSchema>;
export type CoachSocraticOutput = z.infer<typeof coachSocraticSchema>;
