import "server-only";
import { runCoachCards } from "@/lib/cruxy/agents/coach";
import type { ClaimRow, TruthItem } from "@/lib/revision/types";

export type LanguageSuggestions = {
  plain: string;
  analogies: string[];
  vivid: string;
  avoid: string[];
  citation_ids: string[];
};

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function trimPlain(s: string, maxWords = 25): string {
  const words = s.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")}…`;
}

export async function cruxyLanguageSuggestions(input: {
  claim: ClaimRow | undefined;
  truthItems: TruthItem[];
  personId: string;
}): Promise<LanguageSuggestions> {
  const claimText = input.claim?.text ?? "State the claim plainly.";
  const snippets = input.truthItems
    .slice(0, 8)
    .map((t) => `[${t.kind}] ${t.text}`);

  const out = await runCoachCards({
    claimText,
    truthSnippets: snippets,
    personId: input.personId,
    askFirst: false,
  });

  const vividFromCruxy = out.vivid_example?.trim();
  const vividFromTruth =
    input.truthItems.find((t) => t.kind === "example")?.text ??
    input.truthItems.find((t) => t.kind === "fact")?.text ??
    "";

  let analogies = (out.analogies ?? [])
    .map((a) => a.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (analogies.length < 2) {
    const pad = [
      "Like choosing a rule before you know which seat you will sit in.",
      "Like fixing a shared boat: milder patches before ripping out planks.",
    ];
    analogies = [...analogies, ...pad].slice(0, 2);
  }

  const plain = trimPlain(out.plain_sentence?.trim() || claimText);

  const avoid = (out.phrases_to_avoid ?? [])
    .map((p) => p.trim())
    .filter(Boolean);
  const avoidFinal =
    avoid.length > 0
      ? avoid
      : ["obviously", "clearly", "just policy", "slippery slope"];

  const vivid = vividFromCruxy || vividFromTruth;
  const fromClaims = (out.claims ?? []).flatMap((c) => c.citation_ids ?? []);
  const citation_ids =
    fromClaims.length > 0 ? fromClaims : (input.claim?.citation_ids ?? []);

  if (wordCount(plain) > 25) {
    return {
      plain: trimPlain(plain),
      analogies,
      vivid,
      avoid: avoidFinal,
      citation_ids,
    };
  }

  return {
    plain,
    analogies,
    vivid,
    avoid: avoidFinal,
    citation_ids,
  };
}