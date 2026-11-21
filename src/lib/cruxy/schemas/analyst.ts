import { z } from "zod";
import { citedClaimSchema } from "@/lib/cruxy/schemas/common";

export const analystNoteSchema = z.object({
  problem: z
    .enum(["unverified", "contradicts_truth", "weak_support", "empty", "none"])
    .nullable(),
  note: z.string().nullable(),
  claims: z.array(citedClaimSchema).default([]),
});

export const opposingPositionSchema = z.object({
  title: z.string(),
  strongest_support: z.string(),
  weak_point: z.string(),
  commentary_angles: z.tuple([z.string(), z.string()]),
  citation_ids: z.array(z.string()).default([]),
});

export const analystOpposingSchema = z.object({
  positions: z.array(opposingPositionSchema).min(1).max(4),
  claims: z.array(citedClaimSchema).default([]),
});

export const changeTheFactsSchema = z.object({
  items: z.array(
    z.object({
      fact: z.string(),
      why_flips: z.string(),
      citation_ids: z.array(z.string()).default([]),
    }),
  ),
  claims: z.array(citedClaimSchema).default([]),
});

export type AnalystNoteOutput = z.infer<typeof analystNoteSchema>;
export type AnalystOpposingOutput = z.infer<typeof analystOpposingSchema>;
export type ChangeTheFactsOutput = z.infer<typeof changeTheFactsSchema>;
