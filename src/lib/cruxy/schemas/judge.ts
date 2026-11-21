import { z } from "zod";
import { citedClaimSchema } from "@/lib/cruxy/schemas/common";

export const judgeScoreSchema = z.object({
  item: z.string(),
  score: z.number().int().min(1).max(10),
  comment: z.string().optional().nullable(),
  evidence: z
    .array(
      z.object({
        line_id: z.string(),
        quote: z.string(),
      }),
    )
    .min(1)
    .max(3),
});

export const judgeSpeakerFeedbackSchema = z.object({
  speaker_id: z.string(),
  worked: z.string(),
  fix: z.string(),
  why_cost_points: z.string(),
  better_version: z.string(),
  redo_prompt: z.string(),
  citation_ids: z.array(z.string()).default([]),
});

export const judgeSchema = z.object({
  scores: z.array(judgeScoreSchema),
  spirit: z.number().int().min(1).max(5).optional().nullable(),
  spirit_comment: z.string().optional().nullable(),
  overall_comment: z.string().optional().nullable(),
  speaker_feedback: z.array(judgeSpeakerFeedbackSchema).default([]),
  socratic_followups: z.array(z.string()).default([]),
  headline: z.string().optional().nullable(),
  claims: z.array(citedClaimSchema).default([]),
});

export type JudgeOutput = z.infer<typeof judgeSchema>;
