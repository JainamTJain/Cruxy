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
  card: z.string(),
  ideas: z.array(
    z.object({
      text: z.string(),
      kind: z
        .enum(["fact", "quote", "example", "framework", "other"])
        .default("other"),
      case_number: z.number().int().optional().nullable(),
      citation_ids: z.array(z.string()).default([]),
      quote: z.string().optional().nullable(),
    }),
  ),
});

export type LibrarianTagOutput = z.infer<typeof librarianTagSchema>;
