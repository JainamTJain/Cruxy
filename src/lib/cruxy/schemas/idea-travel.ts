import { z } from "zod";

/** Schema mirror for fixtures / tests (runtime uses inline schema in idea-travel.ts). */
export const ideaTravelScoreSchema = z.object({
  appe_score: z.number().min(1).max(10),
  would_help_win: z.boolean(),
  well_supported: z.boolean(),
  reason: z.string().min(8).max(600),
  anonymous_suggestion: z.string().min(12).max(500),
  kind: z.enum(["evidence", "gap", "counter", "sharper", "question"]),
});

export const coherenceFindingsSchema = z.object({
  findings: z
    .array(
      z.object({
        kind: z.enum(["gap", "counter", "sharper", "question"]),
        section_key: z
          .enum([
            "answer_one_sentence",
            "claims",
            "support",
            "objection_reply",
            "values_in_tension",
            "judges_questions",
          ])
          .nullable(),
        text: z.string().min(12).max(500),
      }),
    )
    .max(8),
});
