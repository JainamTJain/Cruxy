import { z } from "zod";
import { citedClaimSchema } from "@/lib/cruxy/schemas/common";

export const opponentSchema = z.object({
  role: z.enum(["presentation", "commentary"]),
  text: z.string(),
  outline: z.array(z.string()).default([]),
  claims: z.array(citedClaimSchema).default([]),
});

export type OpponentOutput = z.infer<typeof opponentSchema>;
