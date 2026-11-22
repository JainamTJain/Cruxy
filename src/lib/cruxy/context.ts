import { embedCruxy, type CruxyMessage } from "@/lib/cruxy/callCruxy";
import { sharedSystemPrefix } from "@/lib/cruxy/prompts/shared";
import { isSampleDataMode } from "@/lib/db/config";
import {
  listPassagesForCase,
  rpcMatchPassages,
  type MatchedPassage,
} from "@/lib/db/supabase/cruxy-extra";
import { listSimilarExamples } from "@/lib/cruxy/examples";
import type { CruxyAgentName } from "@/lib/cruxy/prompts/shared";
import type { CitationSource } from "@/lib/cruxy/citations";

/** Short learning-profile system message for any agent with a personId. */
export async function learningProfileSystemMessages(
  personId?: string | null,
): Promise<CruxyMessage[]> {
  if (!personId) return [];
  try {
    const { getLearningProfile } = await import("@/lib/learning/profile");
    const { formatLearningProfileSummary } = await import(
      "@/lib/learning/summary"
    );
    const summary = formatLearningProfileSummary(
      await getLearningProfile(personId),
    );
    if (!summary) return [];
    return [
      { role: "system", content: `--- Learning profile ---\n${summary}` },
    ];
  } catch {
    return [];
  }
}

export type ClaimMapNode = {
  id: string;
  kind: "claim" | "support" | "backing" | "counterclaim" | "truth";
  text: string;
};

export type CaseCard = {
  caseId: string;
  caseNumber: number;
  title: string;
  crux?: string | null;
  trap?: string | null;
  thesis?: string | null;
};

export type PackedContext = {
  /** Fixed prefix (rules + case card) for prompt caching. */
  prefix: string;
  /** Variable suffix: claim nodes, passages, examples. */
  body: string;
  systemMessages: Array<{ role: "system"; content: string }>;
  sources: CitationSource[];
  passageIds: string[];
};

function cosine(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

async function sampleMatchPassages(input: {
  queryEmbedding: number[];
  caseId: string;
  matchCount: number;
}): Promise<MatchedPassage[]> {
  // Lazy import sample store passages via library repository when available.
  const { listLibraryFiles, listPassagesForFile } = await import(
    "@/lib/db/library-repository"
  );
  const files = await listLibraryFiles();
  const matched: MatchedPassage[] = [];
  for (const f of files) {
    if (!f.case_ids.includes(input.caseId)) continue;
    const passages = await listPassagesForFile(f.id);
    for (const p of passages) {
      const sim = p.embedding
        ? cosine(input.queryEmbedding, p.embedding)
        : 0.01;
      matched.push({
        id: p.id,
        file_id: p.file_id,
        case_id: input.caseId,
        anchor: p.anchor,
        text: p.text,
        similarity: sim,
      });
    }
  }
  return matched
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, input.matchCount);
}

/**
 * Context packing: never send the whole library.
 * Fixed prefix (rules + case card) + claim map nodes + top 8–12 passages.
 */
export async function packCruxyContext(input: {
  caseCard: CaseCard;
  claimNodes?: ClaimMapNode[];
  query: string;
  agent: CruxyAgentName;
  personId?: string | null;
  matchCount?: number;
  includeExamples?: boolean;
}): Promise<PackedContext> {
  const matchCount = Math.min(12, Math.max(8, input.matchCount ?? 10));
  const rules = sharedSystemPrefix();
  const caseBlock = [
    `Case ${input.caseCard.caseNumber}: ${input.caseCard.title}`,
    input.caseCard.crux ? `Crux: ${input.caseCard.crux}` : null,
    input.caseCard.trap ? `Trap: ${input.caseCard.trap}` : null,
    input.caseCard.thesis ? `Thesis: ${input.caseCard.thesis}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const profileMsgs = await learningProfileSystemMessages(input.personId);
  const profileBlock = profileMsgs[0]?.content
    ? `\n\n${profileMsgs[0].content}`
    : "";

  const prefix = `${rules}\n\n--- Case card ---\n${caseBlock}${profileBlock}`;

  const claimBlock = (input.claimNodes ?? [])
    .slice(0, 24)
    .map((n) => `[${n.kind}:${n.id}] ${n.text}`)
    .join("\n");

  let passages: MatchedPassage[] = [];
  const embed = await embedCruxy({
    feature: `context_embed_${input.agent}`,
    value: input.query.slice(0, 2000),
    personId: input.personId ?? null,
  });

  if (embed.ok && embed.embedding.length > 0) {
    passages = isSampleDataMode()
      ? await sampleMatchPassages({
          queryEmbedding: embed.embedding,
          caseId: input.caseCard.caseId,
          matchCount,
        })
      : await rpcMatchPassages({
          queryEmbedding: embed.embedding,
          caseId: input.caseCard.caseId,
          matchCount,
        });
  } else if (embed.ok && embed.stub) {
    // Stub embed: take first N passages for the case (deterministic for tests).
    if (isSampleDataMode()) {
      passages = await sampleMatchPassages({
        queryEmbedding: [],
        caseId: input.caseCard.caseId,
        matchCount,
      });
    } else {
      const rows = await listPassagesForCase(
        input.caseCard.caseId,
        matchCount,
      );
      passages = rows.map((p) => ({
        id: p.id,
        file_id: p.file_id,
        case_id: p.case_id,
        anchor: p.anchor,
        text: p.text,
        similarity: 0,
      }));
    }
  }

  const passageBlock = passages
    .map(
      (p, i) =>
        `[passage:${p.id}] (#${i + 1} sim=${p.similarity.toFixed(3)} ${p.anchor ?? ""})\n${p.text.slice(0, 1200)}`,
    )
    .join("\n\n");

  let exampleBlock = "";
  if (input.includeExamples !== false) {
    const examples = await listSimilarExamples({
      agent: input.agent,
      caseId: input.caseCard.caseId,
      query: input.query,
      limit: 3,
    });
    if (examples.length) {
      exampleBlock = examples
        .map(
          (e) =>
            `[example:${e.id} ${e.kind}] ${e.title}\n${e.body.slice(0, 600)}${e.what_went_wrong ? `\nWhat went wrong: ${e.what_went_wrong}` : ""}`,
        )
        .join("\n\n");
    }
  }

  const body = [
    claimBlock ? `--- Claim map ---\n${claimBlock}` : null,
    passageBlock ? `--- Passages ---\n${passageBlock}` : null,
    exampleBlock ? `--- Worked examples ---\n${exampleBlock}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const sources: CitationSource[] = [
    ...(input.claimNodes ?? []).map((n) => ({
      id: n.id,
      text: n.text,
      kind: "truth_item" as const,
    })),
    ...passages.map((p) => ({
      id: p.id,
      text: p.text,
      kind: "passage" as const,
    })),
  ];

  return {
    prefix,
    body,
    systemMessages: [
      { role: "system", content: prefix },
      ...(body ? [{ role: "system" as const, content: body }] : []),
    ],
    sources,
    passageIds: passages.map((p) => p.id),
  };
}
