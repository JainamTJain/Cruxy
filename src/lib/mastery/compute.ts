/**
 * Mastery from real activity on a claim node:
 * card reviews (linked via truth_item / citation), drill answers, round hits.
 * Never invents scores. Returns null mastery when there is no activity.
 */
import type { SampleStore } from "@/lib/db/sample-store";
import type { ArgEdge } from "@/lib/graph/types";
import type {
  ClaimNodeRef,
  FNodeMastery,
  MasteryMapCellRow,
  MasteryNodeKind,
} from "@/lib/mastery/types";

type StoreSlice = Pick<
  SampleStore,
  | "claims"
  | "supports"
  | "counterclaims"
  | "truth_items"
  | "flashcards"
  | "card_reviews"
  | "questions"
  | "answers"
  | "claim_map_versions"
  | "practice_rounds"
  | "feedback_items"
  | "transcript_lines"
  | "files"
>;

export type { ArgEdge };

export function listClaimNodesForCase(
  store: StoreSlice,
  caseId: string,
  teamId: string | null,
  edges?: ArgEdge[] | null,
): ClaimNodeRef[] {
  const claims = store.claims
    .filter(
      (c) => c.case_id === caseId && (!teamId || c.team_id === teamId),
    )
    .sort((a, b) => a.ord - b.ord);

  if (claims.length > 0) {
    return claims.map((c, i) => ({
      node_kind: "claim" as const,
      node_id: c.id,
      label: truncate(c.text, 48) || `Claim ${i + 1}`,
      ord: c.ord ?? i,
    }));
  }

  // Fall back to latest claim-map body keys for the team
  const versions = store.claim_map_versions
    .filter(
      (v) => v.case_id === caseId && (!teamId || v.team_id === teamId),
    )
    .sort((a, b) => b.version - a.version);
  const body = versions[0]?.body;
  if (body?.claims?.length) {
    return body.claims.map((c, i) => ({
      node_kind: "claim" as const,
      // Stable synthetic id from team+case+key until claim rows exist
      node_id: syntheticNodeId(teamId, caseId, c.key),
      label: truncate(c.text, 48) || `Claim ${i + 1}`,
      ord: i,
    }));
  }

  // Soft use of K's arg_edges (00028): claim nodes on this case
  if (edges?.length) {
    const claimIds = new Set<string>();
    for (const e of edges) {
      if (e.case_id && e.case_id !== caseId) continue;
      if (teamId && e.team_id && e.team_id !== teamId) continue;
      if (e.from_kind === "claim") claimIds.add(e.from_id);
      if (e.to_kind === "claim") claimIds.add(e.to_id);
    }
    return [...claimIds].map((id, i) => ({
      node_kind: "claim" as const,
      node_id: id,
      label: `Claim node ${i + 1}`,
      ord: i,
    }));
  }

  return [];
}

function syntheticNodeId(
  teamId: string | null,
  caseId: string,
  key: string,
): string {
  // Deterministic UUID-shaped id from parts (not a real uuid; stored as text-safe)
  const raw = `${teamId ?? "none"}:${caseId}:${key}`;
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) >>> 0;
  const hex = h.toString(16).padStart(8, "0");
  return `00000000-0000-4000-8000-${hex.padStart(12, "0").slice(0, 12)}`;
}

function truncate(s: string, n: number): string {
  const t = s.trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

function cardsForNode(
  store: StoreSlice,
  caseId: string,
  teamId: string | null,
  node: ClaimNodeRef,
): string[] {
  const claimText = node.label.toLowerCase();
  const truthIds = new Set(
    store.truth_items
      .filter((t) => {
        if (t.case_id !== caseId) return false;
        if (teamId && t.team_id && t.team_id !== teamId) return false;
        if (node.node_kind === "truth_item") return t.id === node.node_id;
        // Soft link: accepted truth text overlaps the claim label
        if (t.status !== "accepted") return false;
        if (claimText.length < 10) return false;
        return t.text.toLowerCase().includes(claimText.slice(0, 18));
      })
      .map((t) => t.id),
  );

  return store.flashcards
    .filter((f) => {
      if (f.case_id && f.case_id !== caseId) return false;
      if (teamId && f.team_id && f.team_id !== teamId) return false;
      if (f.truth_item_id && truthIds.has(f.truth_item_id)) return true;
      // Match claim text snippet on card front/back when no truth link
      if (node.label.length > 12) {
        const needle = node.label.slice(0, 20).toLowerCase();
        return (
          f.front.toLowerCase().includes(needle) ||
          f.back.toLowerCase().includes(needle)
        );
      }
      return false;
    })
    .map((f) => f.id);
}

function questionIdsForNode(
  store: StoreSlice,
  caseId: string,
  node: ClaimNodeRef,
): string[] {
  const needle = node.label.slice(0, 20).toLowerCase().trim();
  if (needle.length < 10) return [];
  return store.questions
    .filter((q) => {
      if (q.case_id !== caseId || q.status !== "active") return false;
      return q.text.toLowerCase().includes(needle);
    })
    .map((q) => q.id);
}

/** Round feedback counts only when it clearly touches this node (text or edges). */
function roundHitsForNode(
  store: StoreSlice,
  caseId: string,
  personId: string,
  node: ClaimNodeRef,
  edges?: ArgEdge[] | null,
): { kind: "worked" | "fix" }[] {
  const roundIds = new Set(
    store.practice_rounds
      .filter((r) => r.case_id === caseId)
      .map((r) => r.id),
  );
  const items = store.feedback_items.filter((f) => {
    if (f.person_id !== personId || !roundIds.has(f.round_id)) return false;
    return f.kind === "worked" || f.kind === "fix";
  });
  if (!items.length) return [];

  const linkedFeedbackIds = new Set<string>();
  const linkedRoundIds = new Set<string>();
  if (edges?.length) {
    for (const e of edges) {
      if (e.case_id && e.case_id !== caseId) continue;
      const touchesClaim =
        (e.from_kind === "claim" && e.from_id === node.node_id) ||
        (e.to_kind === "claim" && e.to_id === node.node_id);
      if (!touchesClaim) continue;
      if (e.type === "used_in_round" && e.round_id) {
        linkedRoundIds.add(e.round_id);
      }
      if (e.from_kind === "feedback_item") linkedFeedbackIds.add(e.from_id);
      if (e.to_kind === "feedback_item") linkedFeedbackIds.add(e.to_id);
    }
  }

  const needle = node.label.slice(0, 18).toLowerCase().trim();
  const out: { kind: "worked" | "fix" }[] = [];
  for (const f of items) {
    const linked =
      linkedFeedbackIds.has(f.id) || linkedRoundIds.has(f.round_id);
    const textHit =
      needle.length >= 10 && f.reasoning.toLowerCase().includes(needle);
    if (!linked && !textHit) continue;
    if (f.kind === "worked" || f.kind === "fix") {
      out.push({ kind: f.kind });
    }
  }
  return out;
}

/**
 * Compute mastery 0..1 from real activity, or null when none.
 * Weights: card reviews 50%, answers 30%, round hits 20%.
 * Prefers F's node_mastery (claim_id) for card-review evidence when present.
 */
export function computeNodeMastery(input: {
  store: StoreSlice;
  personId: string;
  teamId: string | null;
  caseId: string;
  node: ClaimNodeRef;
  edges?: ArgEdge[] | null;
  /** F's node_mastery rows for this person (keyed by claim_id). */
  fNodeMastery?: FNodeMastery[] | null;
}): { mastery: number | null; evidence: MasteryMapCellRow["evidence"] } {
  const { store, personId, teamId, caseId, node, edges, fNodeMastery } = input;

  const fRow =
    node.node_kind === "claim"
      ? (fNodeMastery ?? []).find(
          (m) => m.person_id === personId && m.claim_id === node.node_id,
        )
      : undefined;

  const cardIds = new Set(cardsForNode(store, caseId, teamId, node));
  const reviews = store.card_reviews.filter(
    (r) => r.person_id === personId && cardIds.has(r.card_id),
  );
  const qIds = new Set(questionIdsForNode(store, caseId, node));
  const answers = store.answers.filter(
    (a) => a.person_id === personId && qIds.has(a.question_id),
  );

  const roundHits = roundHitsForNode(store, caseId, personId, node, edges);

  // Prefer F's review_count when the claim is linked in node_mastery
  const card_reviews = fRow
    ? fRow.review_count
    : reviews.length;
  const answerCount = answers.length;
  const round_hits = roundHits.length;

  if (card_reviews === 0 && answerCount === 0 && round_hits === 0) {
    return { mastery: null, evidence: {} };
  }

  // Card mastery: F's stored mastery wins when present
  let cardScore = 0;
  if (fRow && fRow.review_count > 0) {
    cardScore = Math.max(0, Math.min(1, fRow.mastery));
  } else if (cardIds.size > 0) {
    const good = new Set(
      reviews.filter((r) => r.grade >= 3).map((r) => r.card_id),
    );
    cardScore = good.size / cardIds.size;
  } else if (card_reviews > 0) {
    cardScore = Math.min(1, reviews.filter((r) => r.grade >= 3).length / 4);
  }

  // Answer mastery: average score vs self (null scores ignored)
  let answerScore = 0;
  const scored = answers.filter((a) => a.score != null);
  if (scored.length > 0) {
    answerScore =
      scored.reduce((s, a) => s + (a.score ?? 0), 0) / scored.length;
    // scores may be 0..1 or 0..10; normalise
    if (answerScore > 1) answerScore = Math.min(1, answerScore / 10);
  } else if (answerCount > 0) {
    answerScore = Math.min(1, answerCount / 10);
  }

  // Round hits: worked vs fix
  let roundScore = 0;
  if (round_hits > 0) {
    const worked = roundHits.filter((f) => f.kind === "worked").length;
    roundScore = worked / round_hits;
  }

  const parts: { w: number; v: number }[] = [];
  if (card_reviews > 0 || cardIds.size > 0 || fRow)
    parts.push({ w: 0.5, v: cardScore });
  if (answerCount > 0) parts.push({ w: 0.3, v: answerScore });
  if (round_hits > 0) parts.push({ w: 0.2, v: roundScore });
  const wSum = parts.reduce((s, p) => s + p.w, 0) || 1;
  const mastery = Math.max(
    0,
    Math.min(1, parts.reduce((s, p) => s + (p.w / wSum) * p.v, 0)),
  );

  return {
    mastery: Math.round(mastery * 100) / 100,
    evidence: {
      card_reviews: card_reviews || undefined,
      answers: answerCount || undefined,
      round_hits: round_hits || undefined,
    },
  };
}

export function buildMasteryRows(input: {
  store: StoreSlice;
  personId: string;
  teamId: string | null;
  caseId: string;
  nodes: ClaimNodeRef[];
  nowIso: string;
  edges?: ArgEdge[] | null;
  fNodeMastery?: FNodeMastery[] | null;
}): Omit<MasteryMapCellRow, "id">[] {
  return input.nodes.map((node) => {
    const { mastery, evidence } = computeNodeMastery({
      store: input.store,
      personId: input.personId,
      teamId: input.teamId,
      caseId: input.caseId,
      node,
      edges: input.edges,
      fNodeMastery: input.fNodeMastery,
    });
    return {
      person_id: input.personId,
      team_id: input.teamId,
      case_id: input.caseId,
      node_kind: node.node_kind as MasteryNodeKind,
      node_id: node.node_id,
      mastery: mastery ?? 0,
      evidence,
      updated_at: input.nowIso,
    };
  });
}
