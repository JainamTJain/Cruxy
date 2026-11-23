import { z } from "zod";
import { citedClaimSchema } from "@/lib/cruxy/schemas/common";

const optText = z.preprocess(
  (v) => (typeof v === "string" && v.trim() ? v.trim() : null),
  z.string().nullable(),
);

export const assistantSchema = z.object({
  question_first: optText.default(null),
  answer: optText.default(null),
  quiet: z.preprocess((v) => v === true, z.boolean()).default(false),
  claims: z
    .array(z.unknown())
    .default([])
    .transform((xs) =>
      xs.flatMap((x) => {
        const p = citedClaimSchema.safeParse(x);
        return p.success ? [p.data] : [];
      }),
    ),
});

export type AssistantOutput = z.infer<typeof assistantSchema>;
