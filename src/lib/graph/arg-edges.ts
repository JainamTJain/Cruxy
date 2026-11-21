/**
 * Workstream F: open-attack claim ids for graph-aware flashcards.
 * Reads K's arg_edges spine (migration 00028 / recordEdge).
 * Falls back to unanswered counterclaims when the spine has no attacks yet.
 */
import "server-only";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore } from "@/lib/db/sample-store";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import { isGraphSpineReady } from "@/lib/graph/recordEdge";
import type { ArgEdge } from "@/lib/graph/types";

const ANSWER_TYPES = new Set(["rebuts", "distinguishes", "concedes"]);

function counterclaimAnswered(cc: {
  concede: string | null;
  distinguish: string | null;
  rebut: string | null;
}): boolean {
  return Boolean(
    (cc.concede && cc.concede.trim()) ||
      (cc.distinguish && cc.distinguish.trim()) ||
      (cc.rebut && cc.rebut.trim()),
  );
}

function openAttacksFromEdges(
  edges: ArgEdge[],
  caseIds: Set<string>,
): Set<string> {
  const out = new Set<string>();
  const attacks = edges.filter(
    (e) =>
      e.type === "attacks" &&
      e.to_kind === "claim" &&
      (e.case_id == null || caseIds.has(e.case_id)),
  );
  for (const a of attacks) {
    if (a.case_id && !caseIds.has(a.case_id)) continue;
    const answered = edges.some(
      (e) =>
        ANSWER_TYPES.has(e.type) &&
        e.to_kind === "claim" &&
        e.to_id === a.to_id,
    );
    if (!answered) out.add(a.to_id);
  }
  return out;
}

async function openAttacksFromCounterclaims(
  caseIds: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  if (isSampleDataMode()) {
    const store = await readStore();
    for (const cc of store.counterclaims) {
      if (!cc.claim_id || !caseIds.includes(cc.case_id)) continue;
      if (!counterclaimAnswered(cc)) out.add(cc.claim_id);
    }
    return out;
  }
  const sb = getServiceSupabase();
  const { data: ccs, error } = await sb
    .from("counterclaims")
    .select("claim_id,case_id,concede,distinguish,rebut")
    .in("case_id", caseIds)
    .not("claim_id", "is", null);
  if (error || !ccs) return out;
  for (const cc of ccs) {
    if (!cc.claim_id) continue;
    if (
      !counterclaimAnswered({
        concede: cc.concede,
        distinguish: cc.distinguish,
        rebut: cc.rebut,
      })
    ) {
      out.add(cc.claim_id);
    }
  }
  return out;
}

/**
 * Claim ids that currently have an unanswered attack for the given cases.
 * Prefers arg_edges (attacks without concede/distinguish/rebut).
 * Falls back to unanswered counterclaims when the spine is empty for those cases.
 */
export async function listOpenAttackClaimIds(
  caseIds: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  if (caseIds.length === 0) return out;
  const caseSet = new Set(caseIds);

  if (isSampleDataMode()) {
    const store = await readStore();
    const edges = (store.arg_edges ?? []) as ArgEdge[];
    if (edges.length) {
      const fromEdges = openAttacksFromEdges(edges, caseSet);
      // When edges lack case_id, filter via claim rows.
      if (fromEdges.size === 0) {
        const attacks = edges.filter(
          (e) => e.type === "attacks" && e.to_kind === "claim",
        );
        for (const a of attacks) {
          const claim = store.claims.find((c) => c.id === a.to_id);
          if (!claim || !caseSet.has(claim.case_id)) continue;
          const answered = edges.some(
            (e) =>
              ANSWER_TYPES.has(e.type) &&
              e.to_kind === "claim" &&
              e.to_id === a.to_id,
          );
          if (!answered) out.add(a.to_id);
        }
      } else {
        for (const id of fromEdges) out.add(id);
      }
      if (out.size > 0) return out;
    }
    return openAttacksFromCounterclaims(caseIds);
  }

  const ready = await isGraphSpineReady().catch(() => true);
  const sb = getServiceSupabase();

  if (ready) {
    const { data: attacks, error } = await sb
      .from("arg_edges")
      .select("id,to_id,to_kind,type,case_id")
      .eq("type", "attacks")
      .eq("to_kind", "claim")
      .in("case_id", caseIds);
    if (!error && attacks && attacks.length > 0) {
      const claimIds = [...new Set(attacks.map((a) => a.to_id as string))];
      const { data: answers } = await sb
        .from("arg_edges")
        .select("to_id,type")
        .in("type", ["rebuts", "distinguishes", "concedes"])
        .eq("to_kind", "claim")
        .in("to_id", claimIds);
      const answered = new Set((answers ?? []).map((a) => a.to_id as string));
      for (const a of attacks) {
        const id = a.to_id as string;
        if (!answered.has(id)) out.add(id);
      }
      if (out.size > 0) return out;
    }

    // Attacks may omit case_id; scope via claims.
    const { data: looseAttacks } = await sb
      .from("arg_edges")
      .select("id,to_id,to_kind,type,case_id")
      .eq("type", "attacks")
      .eq("to_kind", "claim")
      .is("case_id", null);
    if (looseAttacks?.length) {
      const claimIds = [...new Set(looseAttacks.map((a) => a.to_id as string))];
      const { data: claims } = await sb
        .from("claims")
        .select("id,case_id")
        .in("id", claimIds)
        .in("case_id", caseIds);
      const inScope = new Set((claims ?? []).map((c) => c.id as string));
      if (inScope.size) {
        const { data: answers } = await sb
          .from("arg_edges")
          .select("to_id,type")
          .in("type", ["rebuts", "distinguishes", "concedes"])
          .eq("to_kind", "claim")
          .in("to_id", [...inScope]);
        const answered = new Set((answers ?? []).map((a) => a.to_id as string));
        for (const id of inScope) {
          if (!answered.has(id)) out.add(id);
        }
        if (out.size > 0) return out;
      }
    }
  }

  return openAttacksFromCounterclaims(caseIds);
}
