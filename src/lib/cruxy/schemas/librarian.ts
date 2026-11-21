import { z } from "zod";

export const librarianTagSchema = z.object({
  case_numbers: z.array(z.number().int()),
  type: z.enum([
    "case_set",
    "practice_transcript",
    "team_notes",
    "rules",
    "research",
    "coach_guidance",
    "general",
  ]),
  confidence: z.number().min(0).max(1),
  /** Five-line file card: What / Case(s) / Type / New / Open. */
  card: z.string(),
  ideas: z.array(
    z.object({
      text: z.string(),
      kind: z
        .enum(["fact", "quote", "example", "framework", "other"])
        .default("other"),
      /** Who raised it (speaker name from a transcript, when known). */
      who: z.string().optional().nullable(),
      case_number: z.number().int().optional().nullable(),
      citation_ids: z.array(z.string()).default([]),
      quote: z.string().optional().nullable(),
      /** Strong ideas are offered to other teams as Inspired by Team N. */
      strength: z.enum(["strong", "normal"]).default("normal"),
    }),
  ),
  frameworks: z.array(z.string()).optional().default([]),
  facts: z
    .array(
      z.object({
        text: z.string(),
        source: z.string().optional().nullable(),
      }),
    )
    .optional()
    .default([]),
  moderator_questions: z.array(z.string()).optional().default([]),
  coach_decisions: z.array(z.string()).optional().default([]),
});

export type LibrarianTagOutput = z.infer<typeof librarianTagSchema>;
