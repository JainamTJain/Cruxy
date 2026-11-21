import "server-only";
import { embedCruxy } from "@/lib/cruxy/callCruxy";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore } from "@/lib/db/sample-store";
import { assertOk, getServiceSupabase } from "@/lib/db/supabase/client";
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
  embeddings_skipped_stub: number;
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
    embeddings_skipped_stub: 0,
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

async function embedMissingForTable(
  table: EmbedTable,
  personId?: string | null,
): Promise<{ written: number; stub: number }> {
  let written = 0;
  let stub = 0;

  if (isSampleDataMode()) {
    // Sample mode has no vector column; count rows that would need embeds.
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
  const { data, error } = await sb
    .from(table)
    .select("id,text")
    .is("embedding", null)
    .limit(200);
  assertOk(error, `embedMissing.${table}`);

  for (const row of data ?? []) {
    const text = String(row.text ?? "").trim();
    if (!text) continue;
    const result = await embedCruxy({
      feature: `graph_embed_${table}`,
      value: text,
      personId: personId ?? null,
    });
    if (!result.ok) continue;
    if (result.stub || !result.embedding.length) {
      stub += 1;
      continue;
    }
    const { error: upErr } = await sb
      .from(table)
      .update({ embedding: result.embedding })
      .eq("id", row.id)
      .is("embedding", null);
    assertOk(upErr, `embedMissing.update.${table}`);
    written += 1;
  }
  return { written, stub };
}

/** Embed claims / supports / counterclaims that still lack a vector. */
export async function backfillNodeEmbeddings(opts?: {
  personId?: string | null;
}): Promise<Pick<
  GraphBackfillCounts,
  | "embeddings_claims"
  | "embeddings_supports"
  | "embeddings_counterclaims"
  | "embeddings_skipped_stub"
>> {
  const claims = await embedMissingForTable("claims", opts?.personId);
  const supports = await embedMissingForTable("supports", opts?.personId);
  const counterclaims = await embedMissingForTable(
    "counterclaims",
    opts?.personId,
  );
  return {
    embeddings_claims: claims.written,
    embeddings_supports: supports.written,
    embeddings_counterclaims: counterclaims.written,
    embeddings_skipped_stub: claims.stub + supports.stub + counterclaims.stub,
  };
}

/** Full spine backfill: edges then embeddings. */
export async function runGraphSpineBackfill(opts?: {
  personId?: string | null;
}): Promise<GraphBackfillCounts> {
  const edges = await backfillArgEdges(opts);
  const embeds = await backfillNodeEmbeddings(opts);
  return { ...edges, ...embeds };
}
