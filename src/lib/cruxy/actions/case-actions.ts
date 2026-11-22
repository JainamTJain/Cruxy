/**
 * Case-page actions: accept/reject Team Brief suggestions, queue Evidence Library
 * facts, make flashcards from key points.
 */
import "server-only";

import { randomUUID } from "crypto";
import {
  createProposal,
  decideProposal,
  getCaseBrain,
} from "@/lib/case-brain/service";
import { cannotDoYet, type ActPlanResult } from "@/lib/cruxy/actions/types";
import { saveFlashcard } from "@/lib/db/library-repository";
import { listCases } from "@/lib/db/repository";
import type { Flashcard } from "@/lib/library/types";
import { nowIso } from "@/lib/utils";

export type BriefDecideData = {
  proposalId: string;
  verdict: "accept" | "reject";
  text: string;
  caseId: string;
};

export type EvidenceQueueData = {
  caseId: string;
  text: string;
};

export type FlashcardsMakeData = {
  caseId: string;
  cards: { front: string; back: string; claimId: string | null }[];
};

export {
  looksLikeBriefDecide,
  looksLikeEvidenceQueue,
  looksLikeFlashcards,
} from "@/lib/cruxy/actions/detect";

function caseIdFromPage(page: string, explicit: string | null): string | null {
  if (explicit) return explicit;
  const m = page.match(/\/(?:case-brain|team\/cases)\/([0-9a-f-]{36})/i);
  return m?.[1] ?? null;
}

export async function planBriefDecide(input: {
  message: string;
  page: string;
  caseId: string | null;
  teamId: string;
  personId: string;
}): Promise<ActPlanResult> {
  const caseId = caseIdFromPage(input.page, input.caseId);
  if (!caseId) {
    return {
      kind: "say",
      text: cannotDoYet(
        "accept or reject a suggestion",
        "Open a case, then ask me again, or tap Accept or Reject on the suggestion in the Brief margin.",
      ),
    };
  }
  const brain = await getCaseBrain(input.teamId, caseId);
  const pending = brain.proposals.filter((p) => p.status === "pending");
  if (!pending.length) {
    return {
      kind: "say",
      text: cannotDoYet(
        "accept or reject a suggestion",
        "There is nothing waiting. Open the Team Brief margin on this case when a suggestion appears, then tap Accept or Reject.",
      ),
    };
  }
  const wantReject = /\b(reject|decline|turn down)\b/i.test(input.message);
  const pick =
    pending.find((p) =>
      input.message.toLowerCase().includes(p.text.slice(0, 24).toLowerCase()),
    ) ?? pending[0]!;
  const verdict = wantReject ? "reject" : "accept";
  const data: BriefDecideData = {
    proposalId: pick.id,
    verdict,
    text: pick.text,
    caseId,
  };
  return {
    kind: "plan",
    action: verdict === "accept" ? "brief.accept" : "brief.reject",
    summary:
      verdict === "accept"
        ? "I would accept this Team Brief suggestion. Nothing changes until you tap Apply."
        : "I would reject this Team Brief suggestion. Nothing changes until you tap Apply.",
    lines: [pick.text.slice(0, 280)],
    data,
    teamId: input.teamId,
  };
}

export async function planEvidenceQueue(input: {
  message: string;
  page: string;
  caseId: string | null;
  teamId: string;
}): Promise<ActPlanResult> {
  const caseId = caseIdFromPage(input.page, input.caseId);
  if (!caseId) {
    return {
      kind: "say",
      text: cannotDoYet(
        "add a fact to the Evidence Library queue",
        "Open a case first, or tap Evidence Library on the case and use Add fact.",
      ),
    };
  }
  const stripped = input.message
    .replace(/\b(add|queue|put|save)\b/gi, "")
    .replace(/\b(fact|evidence|truth|library|to|the|a|an)\b/gi, "")
    .replace(/[:\-]+/g, " ")
    .trim();
  const text = stripped.length > 12 ? stripped : input.message.trim();
  if (text.length < 8) {
    return {
      kind: "say",
      text: "Tell me the fact in a short sentence, then I will queue it for the Evidence Library.",
    };
  }
  const data: EvidenceQueueData = { caseId, text: text.slice(0, 500) };
  return {
    kind: "plan",
    action: "evidence.queue",
    summary:
      "I would add this fact to the Evidence Library queue for your team. Nothing is published until someone accepts it.",
    lines: [data.text],
    data,
    teamId: input.teamId,
  };
}

export async function planFlashcards(input: {
  message: string;
  page: string;
  caseId: string | null;
  teamId: string;
}): Promise<ActPlanResult> {
  const caseId = caseIdFromPage(input.page, input.caseId);
  if (!caseId) {
    return {
      kind: "say",
      text: cannotDoYet(
        "make flashcards",
        "Open a case, then ask again, or go to Revision, Flashcards and tap the case deck.",
      ),
    };
  }
  const brain = await getCaseBrain(input.teamId, caseId);
  const cards: FlashcardsMakeData["cards"] = [];
  for (const node of brain.claims.slice(0, 4)) {
    const claim = node.claim.text.trim();
    if (!claim) continue;
    const support = node.supports[0]?.support.text?.trim();
    cards.push({
      front: claim.slice(0, 200),
      back: (support || "Say the support in your own words.").slice(0, 400),
      claimId: node.claim.id,
    });
    for (const row of node.supports.slice(0, 2)) {
      const s = row.support.text.trim();
      if (!s) continue;
      const backing = row.backings[0]?.text?.trim();
      cards.push({
        front: s.slice(0, 200),
        back: (backing || claim).slice(0, 400),
        claimId: node.claim.id,
      });
    }
  }
  const limited = cards.slice(0, 8);
  if (!limited.length) {
    return {
      kind: "say",
      text: cannotDoYet(
        "make flashcards from key points",
        "Add claims and supports on this case first, or open Revision, Flashcards.",
      ),
    };
  }
  const cases = await listCases();
  const title = cases.find((c) => c.id === caseId)?.title ?? "this case";
  return {
    kind: "plan",
    action: "flashcards.make",
    summary: `I would make ${limited.length} flashcards from the key points on ${title}. Nothing is saved until you tap Apply.`,
    lines: limited.map((c, i) => `${i + 1}. ${c.front}`),
    data: { caseId, cards: limited } satisfies FlashcardsMakeData,
    teamId: input.teamId,
  };
}

export async function applyBriefDecide(input: {
  data: BriefDecideData;
  personId: string;
  teamId: string;
}): Promise<{ message: string }> {
  const result = await decideProposal({
    proposalId: input.data.proposalId,
    personId: input.personId,
    teamId: input.teamId,
    verdict: input.data.verdict,
    reason:
      input.data.verdict === "accept"
        ? "Accepted from Cruxy on this case."
        : "Rejected from Cruxy on this case.",
  });
  if (!result.ok) {
    throw new Error(result.error || "That suggestion could not be decided.");
  }
  return {
    message:
      input.data.verdict === "accept"
        ? "Accepted. The suggestion is in your team's decisions."
        : "Rejected. The suggestion is closed.",
  };
}

export async function applyEvidenceQueue(input: {
  data: EvidenceQueueData;
  personId: string;
  teamId: string;
}): Promise<{ message: string }> {
  await createProposal({
    teamId: input.teamId,
    caseId: input.data.caseId,
    personId: input.personId,
    text: input.data.text,
    kind: "fact",
    origin: "member",
    originRef: "cruxy:act:evidence",
  });
  return {
    message:
      "Queued in the Evidence Library for your team. Someone still needs to accept it.",
  };
}

export async function applyFlashcards(input: {
  data: FlashcardsMakeData;
  personId: string;
  teamId: string;
}): Promise<{ message: string }> {
  const now = nowIso();
  for (const c of input.data.cards) {
    const card: Flashcard = {
      id: randomUUID(),
      team_id: input.teamId,
      case_id: input.data.caseId,
      deck: "case",
      front: c.front,
      back: c.back,
      citation_ids: [],
      truth_item_id: null,
      claim_id: c.claimId,
      source_kind: "manual",
      created_at: now,
      created_by: input.personId,
      updated_at: now,
    };
    await saveFlashcard(card);
  }
  return {
    message: `Saved ${input.data.cards.length} flashcards. Open Revision, Flashcards to practise.`,
  };
}
