import "server-only";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore } from "@/lib/db/sample-store";
import { assertOk, getServiceSupabase } from "@/lib/db/supabase/client";
import {
  wireBackingLink,
  wireClaimEdit,
  wireCounterclaimLinks,
  wireFeedbackComment,
  wireJudgeMoment,
  wireBankMoment,
  wireProposalCreated,
  wireSupportLink,
  wireTruthAccepted,
} from "@/lib/graph/wire-writes";
import type { JudgeCard, FeedbackItem, BankEntry } from "@/lib/practice/types";

/** After claim map scaffold or edit: re-link structural edges for a team/case. */
export async function afterClaimMapTouch(opts: {
  teamId: string;
  caseId: string;
  personId?: string | null;
}): Promise<void> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const supports = store.supports.filter(
      (s) => s.team_id === opts.teamId && s.case_id === opts.caseId,
    );
    const backings = store.backings.filter(
      (b) => b.team_id === opts.teamId && b.case_id === opts.caseId,
    );
    const ccs = store.counterclaims.filter(
      (c) => c.team_id === opts.teamId && c.case_id === opts.caseId,
    );
    const claims = store.claims.filter(
      (c) => c.team_id === opts.teamId && c.case_id === opts.caseId,
    );
    for (const c of claims) {
      await wireClaimEdit({
        claimId: c.id,
        teamId: c.team_id,
        caseId: c.case_id,
        personId: opts.personId ?? c.created_by,
        citationIds: c.citation_ids,
      });
    }
    for (const s of supports) {
      await wireSupportLink({
        supportId: s.id,
        claimId: s.claim_id,
        teamId: s.team_id,
        caseId: s.case_id,
        personId: opts.personId ?? s.created_by,
        citationIds: s.citation_ids,
      });
    }
    for (const b of backings) {
      await wireBackingLink({
        backingId: b.id,
        supportId: b.support_id,
        teamId: b.team_id,
        caseId: b.case_id,
        personId: opts.personId ?? b.created_by,
        citationIds: b.citation_ids,
      });
    }
    for (const c of ccs) {
      await wireCounterclaimLinks({
        counterclaimId: c.id,
        claimId: c.claim_id,
        teamId: c.team_id,
        caseId: c.case_id,
        personId: opts.personId ?? c.created_by,
        concede: c.concede,
        distinguish: c.distinguish,
        rebut: c.rebut,
        citationIds: c.citation_ids,
      });
    }
    return;
  }

  const sb = getServiceSupabase();
  const [supports, backings, counterclaims, claims] = await Promise.all([
    sb
      .from("supports")
      .select("id,claim_id,team_id,case_id,created_by,citation_ids")
      .eq("team_id", opts.teamId)
      .eq("case_id", opts.caseId),
    sb
      .from("backings")
      .select("id,support_id,team_id,case_id,created_by,citation_ids")
      .eq("team_id", opts.teamId)
      .eq("case_id", opts.caseId),
    sb
      .from("counterclaims")
      .select(
        "id,claim_id,team_id,case_id,created_by,concede,distinguish,rebut,citation_ids",
      )
      .eq("team_id", opts.teamId)
      .eq("case_id", opts.caseId),
    sb
      .from("claims")
      .select("id,team_id,case_id,created_by,citation_ids")
      .eq("team_id", opts.teamId)
      .eq("case_id", opts.caseId),
  ]);
  assertOk(supports.error, "afterClaimMapTouch.supports");
  assertOk(backings.error, "afterClaimMapTouch.backings");
  assertOk(counterclaims.error, "afterClaimMapTouch.counterclaims");
  assertOk(claims.error, "afterClaimMapTouch.claims");

  for (const c of claims.data ?? []) {
    await wireClaimEdit({
      claimId: c.id,
      teamId: c.team_id,
      caseId: c.case_id,
      personId: opts.personId ?? c.created_by,
      citationIds: c.citation_ids,
    });
  }
  for (const s of supports.data ?? []) {
    if (!s.claim_id) continue;
    await wireSupportLink({
      supportId: s.id,
      claimId: s.claim_id,
      teamId: s.team_id,
      caseId: s.case_id,
      personId: opts.personId ?? s.created_by,
      citationIds: s.citation_ids,
    });
  }
  for (const b of backings.data ?? []) {
    await wireBackingLink({
      backingId: b.id,
      supportId: b.support_id,
      teamId: b.team_id,
      caseId: b.case_id,
      personId: opts.personId ?? b.created_by,
      citationIds: b.citation_ids,
    });
  }
  for (const c of counterclaims.data ?? []) {
    await wireCounterclaimLinks({
      counterclaimId: c.id,
      claimId: c.claim_id,
      teamId: c.team_id,
      caseId: c.case_id,
      personId: opts.personId ?? c.created_by,
      concede: c.concede,
      distinguish: c.distinguish,
      rebut: c.rebut,
      citationIds: c.citation_ids,
    });
  }
}

export async function afterClaimEdited(opts: {
  claimId: string;
  teamId: string;
  personId: string;
}): Promise<void> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const claim = store.claims.find(
      (c) => c.id === opts.claimId && c.team_id === opts.teamId,
    );
    if (!claim) return;
    await wireClaimEdit({
      claimId: claim.id,
      teamId: claim.team_id,
      caseId: claim.case_id,
      personId: opts.personId,
      citationIds: claim.citation_ids,
    });
    return;
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("claims")
    .select("id,team_id,case_id,citation_ids")
    .eq("id", opts.claimId)
    .maybeSingle();
  assertOk(error, "afterClaimEdited");
  if (!data || data.team_id !== opts.teamId) return;
  await wireClaimEdit({
    claimId: data.id,
    teamId: data.team_id,
    caseId: data.case_id,
    personId: opts.personId,
    citationIds: data.citation_ids,
  });
}

export async function afterSupportEdited(opts: {
  supportId: string;
  teamId: string;
  personId: string;
}): Promise<void> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const s = store.supports.find(
      (x) => x.id === opts.supportId && x.team_id === opts.teamId,
    );
    if (!s) return;
    await wireSupportLink({
      supportId: s.id,
      claimId: s.claim_id,
      teamId: s.team_id,
      caseId: s.case_id,
      personId: opts.personId,
      citationIds: s.citation_ids,
    });
    return;
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("supports")
    .select("id,claim_id,team_id,case_id,citation_ids")
    .eq("id", opts.supportId)
    .maybeSingle();
  assertOk(error, "afterSupportEdited");
  if (!data?.claim_id || data.team_id !== opts.teamId) return;
  await wireSupportLink({
    supportId: data.id,
    claimId: data.claim_id,
    teamId: data.team_id,
    caseId: data.case_id,
    personId: opts.personId,
    citationIds: data.citation_ids,
  });
}

export async function afterCounterclaimEdited(opts: {
  counterclaimId: string;
  teamId: string;
  personId: string;
}): Promise<void> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const c = store.counterclaims.find(
      (x) => x.id === opts.counterclaimId && x.team_id === opts.teamId,
    );
    if (!c) return;
    await wireCounterclaimLinks({
      counterclaimId: c.id,
      claimId: c.claim_id,
      teamId: c.team_id,
      caseId: c.case_id,
      personId: opts.personId,
      concede: c.concede,
      distinguish: c.distinguish,
      rebut: c.rebut,
      citationIds: c.citation_ids,
    });
    return;
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("counterclaims")
    .select(
      "id,claim_id,team_id,case_id,concede,distinguish,rebut,citation_ids",
    )
    .eq("id", opts.counterclaimId)
    .maybeSingle();
  assertOk(error, "afterCounterclaimEdited");
  if (!data || data.team_id !== opts.teamId) return;
  await wireCounterclaimLinks({
    counterclaimId: data.id,
    claimId: data.claim_id,
    teamId: data.team_id,
    caseId: data.case_id,
    personId: opts.personId,
    concede: data.concede,
    distinguish: data.distinguish,
    rebut: data.rebut,
    citationIds: data.citation_ids,
  });
}

export async function afterBackingEdited(opts: {
  backingId: string;
  teamId: string;
  personId: string;
}): Promise<void> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const b = store.backings.find(
      (x) => x.id === opts.backingId && x.team_id === opts.teamId,
    );
    if (!b) return;
    await wireBackingLink({
      backingId: b.id,
      supportId: b.support_id,
      teamId: b.team_id,
      caseId: b.case_id,
      personId: opts.personId,
      citationIds: b.citation_ids,
    });
    return;
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("backings")
    .select("id,support_id,team_id,case_id,citation_ids")
    .eq("id", opts.backingId)
    .maybeSingle();
  assertOk(error, "afterBackingEdited");
  if (!data || data.team_id !== opts.teamId) return;
  await wireBackingLink({
    backingId: data.id,
    supportId: data.support_id,
    teamId: data.team_id,
    caseId: data.case_id,
    personId: opts.personId,
    citationIds: data.citation_ids,
  });
}

export async function afterProposalCreated(opts: {
  proposalId: string;
  teamId: string;
  caseId: string;
  personId: string;
  inspiredFromTeamId?: string | null;
  citationIds?: string[] | null;
}): Promise<void> {
  await wireProposalCreated({
    proposalId: opts.proposalId,
    teamId: opts.teamId,
    caseId: opts.caseId,
    personId: opts.personId,
    inspiredFromTeamId: opts.inspiredFromTeamId,
    citationIds: opts.citationIds,
  });
}

export async function afterTruthAccepted(opts: {
  truthItemId: string;
  proposalId: string;
  teamId: string;
  caseId: string;
  personId: string;
  citationIds?: string[] | null;
}): Promise<void> {
  await wireTruthAccepted(opts);
}

export async function afterJudgeCardSaved(card: JudgeCard): Promise<void> {
  for (const m of card.moments ?? []) {
    await wireJudgeMoment({
      lineId: m.line_id,
      roundId: card.round_id,
      cardId: card.id,
      teamId: card.team_id,
      personId: card.created_by,
    });
  }
}

export async function afterFeedbackSaved(
  items: FeedbackItem[],
): Promise<void> {
  for (const f of items) {
    await wireFeedbackComment({
      feedbackId: f.id,
      lineId: f.quote_line_id,
      roundId: f.round_id,
      personId: f.person_id,
    });
  }
}

export async function afterBankEntrySaved(entry: BankEntry): Promise<void> {
  await wireBankMoment({
    bankEntryId: entry.id,
    lineId: entry.example_line_id,
    caseId: entry.case_id,
    personId: entry.created_by,
  });
}
