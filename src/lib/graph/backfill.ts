import "server-only";
import { embedCruxy } from "@/lib/cruxy/callCruxy";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore } from "@/lib/db/sample-store";
import { assertOk, getServiceSupabase } from "@/lib/db/supabase/client";
import {
  cosine,
  embedPassageText,
  stubEmbed,
} from "@/lib/library/embeddings";
import { EMBEDDING_DIM } from "@/lib/library/types";
import {
  wireBackingLink,
  wireCounterclaimLinks,
  wireFeedbackComment,
  wireJudgeMoment,
  wireProposalCreated,
  wireSupportLink,
  wireTruthAccepted,
} from "@/lib/graph/wire-writes";

export type GraphBackfillCounts = {
  edges_written: number;
  supports_linked: number;
  backings_linked: number;
  counterclaims_linked: number;
  citations_linked: number;
  proposals_linked: number;
  truth_linked: number;
  moments_linked: number;
  feedback_linked: number;
  embeddings_claims: number;
  embeddings_supports: number;
  embeddings_counterclaims: number;
  embeddings_passages: number;
  embeddings_skipped_stub: number;
  passages_marked_stub: number;
};

function emptyCounts(): GraphBackfillCounts {
  return {
    edges_written: 0,
    supports_linked: 0,
    backings_linked: 0,
    counterclaims_linked: 0,
    citations_linked: 0,
    proposals_linked: 0,
    truth_linked: 0,
    moments_linked: 0,
    feedback_linked: 0,
    embeddings_claims: 0,
    embeddings_supports: 0,
    embeddings_counterclaims: 0,
    embeddings_passages: 0,
    embeddings_skipped_stub: 0,
    passages_marked_stub: 0,
  };
}

async function countEdgesAfter(): Promise<number> {
  if (isSampleDataMode()) {
    const store = (await readStore()) as unknown as { arg_edges?: unknown[] };
    return store.arg_edges?.length ?? 0;
  }
  const sb = getServiceSupabase();
  const { count, error } = await sb
    .from("arg_edges")
    .select("*", { count: "exact", head: true });
  assertOk(error, "countEdgesAfter");
  return count ?? 0;
}

function parseEmbedding(raw: unknown): number[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw.map(Number);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed.map(Number);
    } catch {
      return null;
    }
  }
  return null;
}

/** True when stored vector matches the deterministic local stub for this text. */
export function looksLikeStubEmbedding(
  text: string,
  embedding: number[] | null,
): boolean {
  if (!embedding || embedding.length === 0) return true;
  const stub = stubEmbed(text || "empty", EMBEDDING_DIM);
  const a =
    embedding.length === EMBEDDING_DIM
      ? embedding
      : embedding.concat(new Array(Math.max(0, EMBEDDING_DIM - embedding.length)).fill(0)).slice(0, EMBEDDING_DIM);
  return cosine(a, stub) > 0.999;
}

/**
 * Backfill structural edges from existing claim-map / Truth Source / practice rows.
 * Idempotent via recordEdge edge_key. Does not invent content.
 */
export async function backfillArgEdges(opts?: {
  personId?: string | null;
}): Promise<GraphBackfillCounts> {
  const counts = emptyCounts();
  const before = await countEdgesAfter();
  const actor = opts?.personId ?? null;

  if (isSampleDataMode()) {
    const store = await readStore();
    for (const s of store.supports) {
      await wireSupportLink({
        supportId: s.id,
        claimId: s.claim_id,
        teamId: s.team_id,
        caseId: s.case_id,
        personId: actor ?? s.created_by,
        citationIds: s.citation_ids,
      });
      counts.supports_linked += 1;
      counts.citations_linked += s.citation_ids?.length ?? 0;
    }
    for (const b of store.backings) {
      await wireBackingLink({
        backingId: b.id,
        supportId: b.support_id,
        teamId: b.team_id,
        caseId: b.case_id,
        personId: actor ?? b.created_by,
        citationIds: b.citation_ids,
      });
      counts.backings_linked += 1;
    }
    for (const c of store.counterclaims) {
      await wireCounterclaimLinks({
        counterclaimId: c.id,
        claimId: c.claim_id,
        teamId: c.team_id,
        caseId: c.case_id,
        personId: actor ?? c.created_by,
        concede: c.concede,
        distinguish: c.distinguish,
        rebut: c.rebut,
        citationIds: c.citation_ids,
      });
      counts.counterclaims_linked += 1;
    }
    for (const p of store.proposals) {
      await wireProposalCreated({
        proposalId: p.id,
        teamId: p.team_id,
        caseId: p.case_id,
        personId: actor ?? p.created_by,
        inspiredFromTeamId: p.inspired_from_team_id,
        origin: p.origin,
        citationIds: p.citation_ids,
      });
      counts.proposals_linked += 1;
    }
    for (const d of store.decisions) {
      if (d.verdict !== "accept" && d.verdict !== "edit") continue;
      const proposal = store.proposals.find((p) => p.id === d.proposal_id);
      if (!proposal) continue;
      const truth = store.truth_items.find(
        (t) =>
          t.team_id === proposal.team_id &&
          t.case_id === proposal.case_id &&
          t.text === (d.edited_text ?? proposal.text),
      );
      if (!truth) continue;
      await wireTruthAccepted({
        truthItemId: truth.id,
        proposalId: proposal.id,
        teamId: truth.team_id,
        caseId: truth.case_id,
        personId: actor ?? d.person_id,
        citationIds: truth.citation_ids,
      });
      counts.truth_linked += 1;
    }
    for (const card of store.judge_cards) {
      for (const m of card.moments ?? []) {
        await wireJudgeMoment({
          lineId: m.line_id,
          roundId: card.round_id,
          cardId: card.id,
          teamId: card.team_id,
          personId: actor ?? card.created_by,
        });
        counts.moments_linked += 1;
      }
    }
    for (const f of store.feedback_items) {
      await wireFeedbackComment({
        feedbackId: f.id,
        lineId: f.quote_line_id,
        roundId: f.round_id,
        personId: f.person_id,
      });
      if (f.quote_line_id) counts.feedback_linked += 1;
    }
  } else {
    const sb = getServiceSupabase();
    const [supports, backings, counterclaims, proposals, decisions, cards, feedback] =
      await Promise.all([
        sb.from("supports").select("id,claim_id,team_id,case_id,created_by,citation_ids"),
        sb.from("backings").select("id,support_id,team_id,case_id,created_by,citation_ids"),
        sb
          .from("counterclaims")
          .select(
            "id,claim_id,team_id,case_id,created_by,concede,distinguish,rebut,citation_ids",
          ),
        sb
          .from("proposals")
          .select(
            "id,team_id,case_id,created_by,inspired_from_team_id,origin,citation_ids,text,status",
          ),
        sb.from("decisions").select("id,proposal_id,person_id,verdict,edited_text"),
        sb.from("judge_cards").select("id,round_id,team_id,created_by,moments"),
        sb
          .from("feedback_items")
          .select("id,round_id,person_id,quote_line_id"),
      ]);
    assertOk(supports.error, "backfill.supports");
    assertOk(backings.error, "backfill.backings");
    assertOk(counterclaims.error, "backfill.counterclaims");
    assertOk(proposals.error, "backfill.proposals");
    assertOk(decisions.error, "backfill.decisions");
    assertOk(cards.error, "backfill.cards");
    assertOk(feedback.error, "backfill.feedback");

    for (const s of supports.data ?? []) {
      if (!s.claim_id) continue;
      await wireSupportLink({
        supportId: s.id,
        claimId: s.claim_id,
        teamId: s.team_id,
        caseId: s.case_id,
        personId: actor ?? s.created_by,
        citationIds: s.citation_ids,
      });
      counts.supports_linked += 1;
      counts.citations_linked += (s.citation_ids as string[] | null)?.length ?? 0;
    }
    for (const b of backings.data ?? []) {
      await wireBackingLink({
        backingId: b.id,
        supportId: b.support_id,
        teamId: b.team_id,
        caseId: b.case_id,
        personId: actor ?? b.created_by,
        citationIds: b.citation_ids,
      });
      counts.backings_linked += 1;
    }
    for (const c of counterclaims.data ?? []) {
      await wireCounterclaimLinks({
        counterclaimId: c.id,
        claimId: c.claim_id,
        teamId: c.team_id,
        caseId: c.case_id,
        personId: actor ?? c.created_by,
        concede: c.concede,
        distinguish: c.distinguish,
        rebut: c.rebut,
        citationIds: c.citation_ids,
      });
      counts.counterclaims_linked += 1;
    }
    for (const p of proposals.data ?? []) {
      await wireProposalCreated({
        proposalId: p.id,
        teamId: p.team_id,
        caseId: p.case_id,
        personId: actor ?? p.created_by,
        inspiredFromTeamId: p.inspired_from_team_id,
        origin: p.origin,
        citationIds: p.citation_ids,
      });
      counts.proposals_linked += 1;
    }

    const proposalById = new Map((proposals.data ?? []).map((p) => [p.id, p]));
    for (const d of decisions.data ?? []) {
      if (d.verdict !== "accept" && d.verdict !== "edit") continue;
      const proposal = proposalById.get(d.proposal_id);
      if (!proposal) continue;
      const acceptedText = (d.edited_text as string | null) ?? proposal.text;
      const { data: truthRows, error: truthErr } = await sb
        .from("truth_items")
        .select("id,team_id,case_id,citation_ids")
        .eq("team_id", proposal.team_id)
        .eq("case_id", proposal.case_id)
        .eq("text", acceptedText)
        .limit(1);
      assertOk(truthErr, "backfill.truth_lookup");
      const truth = truthRows?.[0];
      if (!truth) continue;
      await wireTruthAccepted({
        truthItemId: truth.id,
        proposalId: proposal.id,
        teamId: truth.team_id,
        caseId: truth.case_id,
        personId: actor ?? d.person_id,
        citationIds: truth.citation_ids,
      });
      counts.truth_linked += 1;
    }

    for (const card of cards.data ?? []) {
      const moments = (card.moments as { line_id: string; note: string }[] | null) ?? [];
      for (const m of moments) {
        await wireJudgeMoment({
          lineId: m.line_id,
          roundId: card.round_id,
          cardId: card.id,
          teamId: card.team_id,
          personId: actor ?? card.created_by,
        });
        counts.moments_linked += 1;
      }
    }
    for (const f of feedback.data ?? []) {
      await wireFeedbackComment({
        feedbackId: f.id,
        lineId: f.quote_line_id,
        roundId: f.round_id,
        personId: f.person_id,
      });
      if (f.quote_line_id) counts.feedback_linked += 1;
    }
  }

  const after = await countEdgesAfter();
  counts.edges_written = Math.max(0, after - before);
  return counts;
}

type EmbedTable = "claims" | "supports" | "counterclaims";

async function embedMissingOrStubForTable(
  table: EmbedTable,
  personId?: string | null,
): Promise<{ written: number; stub: number }> {
  let written = 0;
  let stub = 0;

  if (isSampleDataMode()) {
    const store = await readStore();
    const rows =
      table === "claims"
        ? store.claims
        : table === "supports"
          ? store.supports
          : store.counterclaims;
    return { written: 0, stub: rows.length };
  }

  const sb = getServiceSupabase();
  // Prefer flagged stubs / nulls; fall back to null-only if column missing.
  let data: { id: string; text: string }[] | null = null;
  {
    const res = await sb
      .from(table)
      .select("id,text")
      .or("embedding.is.null,embedding_stub.eq.true")
      .limit(400);
    if (res.error) {
      const fallback = await sb
        .from(table)
        .select("id,text")
        .is("embedding", null)
        .limit(400);
      assertOk(fallback.error, `embedMissing.${table}`);
      data = fallback.data;
    } else {
      data = res.data;
    }
  }

  for (const row of data ?? []) {
    const text = String(row.text ?? "").trim();
    if (!text) continue;
    const result = await embedCruxy({
      feature: `graph_embed_${table}`,
      value: text.slice(0, 6000),
      personId: personId ?? null,
    });
    if (!result.ok) continue;
    if (result.stub || !result.embedding.length) {
      stub += 1;
      await sb
        .from(table)
        .update({ embedding_stub: true })
        .eq("id", row.id);
      continue;
    }
    let embedding = result.embedding;
    if (embedding.length < EMBEDDING_DIM) {
      embedding = embedding.concat(
        new Array(EMBEDDING_DIM - embedding.length).fill(0),
      );
    } else if (embedding.length > EMBEDDING_DIM) {
      embedding = embedding.slice(0, EMBEDDING_DIM);
    }
    const { error: upErr } = await sb
      .from(table)
      .update({ embedding, embedding_stub: false })
      .eq("id", row.id);
    assertOk(upErr, `embedMissing.update.${table}`);
    written += 1;
  }
  return { written, stub };
}

/**
 * Re-embed passages that only have a stub vector (gateway was down / refused).
 * Also marks undetected stubs via cosine match to stubEmbed(text).
 */
export async function reembedStubPassages(opts?: {
  personId?: string | null;
  limit?: number;
}): Promise<{ written: number; skipped_stub: number; marked: number }> {
  let written = 0;
  let skipped_stub = 0;
  let marked = 0;

  if (isSampleDataMode()) {
    return { written: 0, skipped_stub: 0, marked: 0 };
  }

  const sb = getServiceSupabase();
  const limit = opts?.limit ?? 400;

  // 1) Rows already flagged as stub
  let flagged =
    (
      await sb
        .from("passages")
        .select("id,text")
        .eq("embedding_stub", true)
        .limit(limit)
    ).data ?? [];

  // 2) Detect unflagged stubs by comparing to stubEmbed (batch of recent passages)
  if (flagged.length < limit) {
    const { data: candidates, error } = await sb
      .from("passages")
      .select("id,text,embedding,embedding_stub")
      .eq("embedding_stub", false)
      .not("embedding", "is", null)
      .order("created_at", { ascending: false })
      .limit(Math.min(500, limit * 2));
    if (!error) {
      for (const row of candidates ?? []) {
        if (flagged.length >= limit) break;
        const emb = parseEmbedding(row.embedding);
        if (!looksLikeStubEmbedding(String(row.text ?? ""), emb)) continue;
        await sb
          .from("passages")
          .update({ embedding_stub: true })
          .eq("id", row.id);
        marked += 1;
        flagged.push({ id: row.id, text: row.text });
      }
    }
  }

  // Also include null embeddings
  if (flagged.length < limit) {
    const { data: nulls } = await sb
      .from("passages")
      .select("id,text")
      .is("embedding", null)
      .limit(limit - flagged.length);
    for (const row of nulls ?? []) {
      if (flagged.some((f) => f.id === row.id)) continue;
      flagged.push(row);
    }
  }

  const BATCH = 8;
  for (let i = 0; i < flagged.length; i += BATCH) {
    const batch = flagged.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (row) => {
        const text = String(row.text ?? "").trim();
        if (!text) return;
        const emb = await embedPassageText(text, {
          personId: opts?.personId ?? null,
          feature: "passage_reembed",
        });
        if (emb.stub || !emb.embedding.length) {
          skipped_stub += 1;
          await sb
            .from("passages")
            .update({ embedding_stub: true })
            .eq("id", row.id);
          return;
        }
        const { error } = await sb
          .from("passages")
          .update({
            embedding: emb.embedding,
            embedding_stub: false,
          })
          .eq("id", row.id);
        assertOk(error, "reembedStubPassages.update");
        written += 1;
      }),
    );
  }

  return { written, skipped_stub, marked };
}

/** Embed claims / supports / counterclaims that still lack a real vector. */
export async function backfillNodeEmbeddings(opts?: {
  personId?: string | null;
}): Promise<Pick<
  GraphBackfillCounts,
  | "embeddings_claims"
  | "embeddings_supports"
  | "embeddings_counterclaims"
  | "embeddings_passages"
  | "embeddings_skipped_stub"
  | "passages_marked_stub"
>> {
  const claims = await embedMissingOrStubForTable("claims", opts?.personId);
  const supports = await embedMissingOrStubForTable("supports", opts?.personId);
  const counterclaims = await embedMissingOrStubForTable(
    "counterclaims",
    opts?.personId,
  );
  const passages = await reembedStubPassages(opts);
  return {
    embeddings_claims: claims.written,
    embeddings_supports: supports.written,
    embeddings_counterclaims: counterclaims.written,
    embeddings_passages: passages.written,
    embeddings_skipped_stub:
      claims.stub + supports.stub + counterclaims.stub + passages.skipped_stub,
    passages_marked_stub: passages.marked,
  };
}

/** Full spine backfill: edges then embeddings (nodes + stub passages). */
export async function runGraphSpineBackfill(opts?: {
  personId?: string | null;
}): Promise<GraphBackfillCounts> {
  const edges = await backfillArgEdges(opts);
  const embeds = await backfillNodeEmbeddings(opts);
  return { ...edges, ...embeds };
}
