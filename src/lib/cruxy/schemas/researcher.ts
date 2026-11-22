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
  /** Rubric composite 0..100; only request if it clears the bar. */
  rubric_composite: z.number().min(0).max(100).optional().nullable(),
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

const rubricScoresSchema = z.object({
  relevance: z.number().min(0).max(100),
  argumentative_force: z.number().min(0).max(100),
  credibility: z.number().min(0).max(100),
});

/** Wave 8: curate and judge after verify. */
export const researcherCurateSchema = z.object({
  ranks: z
    .array(
      z.object({
        finding_index: z.number().int().min(0),
        claim_ref: z.string(),
        role: z.enum(["support", "steelman", "more"]),
        why_place: z.string().max(220),
        scores: rubricScoresSchema,
      }),
    )
    .default([]),
  /** At most 3 indices into tonight's findings list. */
  nightly_finding_indices: z.array(z.number().int().min(0)).max(3).default([]),
  brief: z.object({
    summary: z.string().max(400),
    judgment_changes: z.string().max(400),
    judgment_does_not: z.string().max(400),
  }),
  claims: z.array(citedClaimSchema).default([]),
});

export type ResearcherSearchOutput = z.infer<typeof researcherSearchSchema>;
export type ResearcherVerifyOutput = z.infer<typeof researcherVerifySchema>;
export type ResearcherCurateOutput = z.infer<typeof researcherCurateSchema>;
