import { z } from "zod";

/** A single cited claim: text may include a quote that must appear in a cited source. */
export const citedClaimSchema = z.object({
  text: z.string(),
  quote: z.string().optional().nullable(),
  citation_ids: z.array(z.string()).default([]),
});

export type CitedClaim = z.infer<typeof citedClaimSchema>;

export const quietRefusalSchema = z.object({
  quiet: z.literal(true),
  reason: z.string(),
});
