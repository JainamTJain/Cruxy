import { z } from "zod";
import { citedClaimSchema } from "@/lib/cruxy/schemas/common";

export const moderatorQuestionSchema = z.object({
  text: z.string(),
  type: z.enum([
    "follow_up",
    "pushback",
    "other_team",
    "change_facts",
    "state_view",
    "closing",
  ]),
  difficulty: z.number().int().min(1).max(3),
  citation_ids: z.array(z.string()).default([]),
});

export const moderatorSchema = z.object({
  questions: z.array(moderatorQuestionSchema),
  claims: z.array(citedClaimSchema).default([]),
});

export type ModeratorOutput = z.infer<typeof moderatorSchema>;
