import { z } from "zod";
import { citedClaimSchema } from "@/lib/cruxy/schemas/common";

export const researchGapSchema = z.object({
  kind: z.enum([
    "unsupported_support",
    "unverified_fact",
    "unanswered_counter",
    "unanswered_moderator",
  ]),
  claim_ref: z.string(),
  detail: z.string(),
});

export const researchFindingSchema = z.object({
  /** F-102: finding card point at most ~40 words (soft cap via chars). */
  point: z.string().max(280),
  why_it_matters: z.string(),
  claim_ref: z.string(),
  /** Short quote only (F-107). */
  quote: z.string().max(280),
  link: z.string(),
  verified: z.boolean(),
  needs_check: z.boolean(),
  source_ids: z.array(z.string()),
  citation_ids: z.array(z.string()).default([]),
  /** Optional even-handed lean note (F-024). */
  lean_flag: z.string().optional().nullable(),
});

export const researcherSearchSchema = z.object({
  gaps: z.array(researchGapSchema),
  findings: z.array(researchFindingSchema),
  book_request: z
    .object({
      title: z.string(),
      reason: z.string(),
      chapter: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
  claims: z.array(citedClaimSchema).default([]),
});

export const researcherVerifySchema = z.object({
  findings: z.array(researchFindingSchema),
  closed_gaps: z.array(z.string()).default([]),
  claims: z.array(citedClaimSchema).default([]),
});

export type ResearcherSearchOutput = z.infer<typeof researcherSearchSchema>;
export type ResearcherVerifyOutput = z.infer<typeof researcherVerifySchema>;
