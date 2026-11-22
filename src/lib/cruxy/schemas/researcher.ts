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
  /** Short quote only (F-107). Store longer passages only for open licence. */
  quote: z.string().max(280),
  link: z.string(),
  verified: z.boolean(),
  needs_check: z.boolean(),
  source_ids: z.array(z.string()),
  citation_ids: z.array(z.string()).default([]),
  lean_flag: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  authors: z.array(z.string()).optional().nullable(),
  year: z.number().int().optional().nullable(),
  doi: z.string().optional().nullable(),
  licence: z.string().optional().nullable(),
  open_access: z.boolean().optional().nullable(),
  citation: z.string().optional().nullable(),
});

export const materialRequestSchema = z.object({
  title: z.string(),
  citation: z.string(),
  why_it_matters: z.string(),
  claim_ref: z.string().optional().nullable(),
  where_to_look: z.string().optional().nullable(),
  authors: z.string().optional().nullable(),
  year: z.number().int().optional().nullable(),
  doi: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
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
  material_requests: z.array(materialRequestSchema).optional().default([]),
  claims: z.array(citedClaimSchema).default([]),
});

export const researcherVerifySchema = z.object({
  findings: z.array(researchFindingSchema),
  closed_gaps: z.array(z.string()).default([]),
  claims: z.array(citedClaimSchema).default([]),
});

export type ResearcherSearchOutput = z.infer<typeof researcherSearchSchema>;
export type ResearcherVerifyOutput = z.infer<typeof researcherVerifySchema>;
