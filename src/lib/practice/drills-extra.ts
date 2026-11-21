/**
 * Workstream G Wave 5: practice drill helpers (moderator, commentary,
 * judges Q&A, free record, conferral, Q&A routing checks).
 * New file so we do not rewrite Track 5 practice modules owned by D.
 */
import "server-only";
import { callCruxy } from "@/lib/cruxy/callCruxy";
import { createProposal } from "@/lib/case-brain/service";
import { listQuestions, serveQuestion } from "@/lib/revision/repository";
import {
  getPersonById,
  listPeopleFull,
  logActivity,
} from "@/lib/db/repository";
import { getRoundById, getTranscript } from "@/lib/db/practice-repository";
import {
  listClaimTextsForDrill,
  listQaRouting,
  type QaQuestionKind,
} from "@/lib/db/supabase/practice-drills-extra";
import type { ModeratorQuestion } from "@/lib/revision/types";

export { listClaimTextsForDrill };

export async function pickModeratorQuestion(opts: {
  personId: string;
  caseId?: string | null;
  sessionKey: string;
}): Promise<ModeratorQuestion | null> {
  if (opts.caseId) {
    const pool = await listQuestions({
      caseId: opts.caseId,
      status: "active",
    });
    if (pool.length === 0) {
      const any = await listQuestions({ status: "active" });
      if (!any.length) return null;
      return any[Math.floor(Math.random() * any.length)] ?? null;
    }
    return pool[Math.floor(Math.random() * pool.length)] ?? null;
  }
  return serveQuestion({
    personId: opts.personId,
    sessionKey: opts.sessionKey,
  });
}

function tryParseJson<T>(text: string): T | null {
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

export async function generateCommentaryPresentation(opts: {
  personId: string;
  caseTitle: string;
  caseNumber: number | null;
  claimTexts: string[];
}): Promise<{ presentation: string; durationHintMin: number }> {
  const claims =
    opts.claimTexts.slice(0, 6).join("\n- ") ||
    "No claim map yet; argue a careful opposing view of the case.";
  const result = await callCruxy({
    feature: "commentary_drill_presentation",
    tier: "strong",
    personId: opts.personId,
    messages: [
      {
        role: "system",
        content:
          "You are Cruxy playing the presenting team in an Ethics Bowl commentary drill. Write a clear 7 to 12 minute case presentation the other team can comment on. Plain words. Return JSON only: {\"presentation\":\"...\",\"durationHintMin\":number}.",
      },
      {
        role: "user",
        content: `Case ${opts.caseNumber ?? "?"}: ${opts.caseTitle}\nTeam claims to push against:\n- ${claims}`,
      },
    ],
  });
  if (!result.ok) {
    return {
      presentation:
        "Cruxy could not build a presentation right now. Try again in a moment, or comment on the case from your own reading.",
      durationHintMin: 8,
    };
  }
  const parsed = tryParseJson<{
    presentation?: string;
    durationHintMin?: number;
  }>(result.text);
  return {
    presentation:
      parsed?.presentation?.trim() ||
      result.text.trim() ||
      "Cruxy had nothing to say.",
    durationHintMin:
      typeof parsed?.durationHintMin === "number"
        ? Math.min(12, Math.max(7, Math.round(parsed.durationHintMin)))
        : 8,
  };
}

export async function generateJudgesQaQuestions(opts: {
  personId: string;
  caseTitle: string;
  claimTexts: string[];
}): Promise<{ kind: QaQuestionKind; text: string }[]> {
  const claims =
    opts.claimTexts.slice(0, 5).join("\n- ") ||
    "No claims yet; ask careful follow-ups on the case.";
  const result = await callCruxy({
    feature: "judges_qa_drill",
    tier: "strong",
    personId: opts.personId,
    messages: [
      {
        role: "system",
        content:
          'You are a Cruxy judge panel for an Ethics Bowl drill. Return JSON only: {"questions":[{"kind":"facts"|"framework_pushback"|"change_facts"|"practical","text":"..."}]}. Give 4 rapid questions: one of each kind. Push hard but stay fair.',
      },
      {
        role: "user",
        content: `Case: ${opts.caseTitle}\nClaims:\n- ${claims}`,
      },
    ],
  });
  if (!result.ok) return [];
  const parsed = tryParseJson<{
    questions?: { kind?: string; text?: string }[];
  }>(result.text);
  const kinds: QaQuestionKind[] = [
    "facts",
    "framework_pushback",
    "change_facts",
    "practical",
  ];
  const out: { kind: QaQuestionKind; text: string }[] = [];
  for (const q of parsed?.questions ?? []) {
    const kind = kinds.includes(q.kind as QaQuestionKind)
      ? (q.kind as QaQuestionKind)
      : "facts";
    if (q.text?.trim()) out.push({ kind, text: q.text.trim() });
  }
  if (out.length) return out.slice(0, 6);
  // Honest empty: no invented judge lines attributed to people
  return kinds.map((kind) => ({
    kind,
    text: `Cruxy could not draft a ${kind.replaceAll("_", " ")} question. Ask your coach for a live one, or retry.`,
  }));
}

export async function extractFreeRecordIdeas(opts: {
  personId: string;
  teamId: string;
  caseId: string;
  roundId: string;
}): Promise<{ created: number; ideas: string[] }> {
  const lines = await getTranscript(opts.roundId);
  const transcript = lines
    .map((l) => `${l.speaker_label ?? "?"}: ${l.text}`)
    .join("\n")
    .slice(0, 12000);
  if (!transcript.trim()) {
    return { created: 0, ideas: [] };
  }
  const result = await callCruxy({
    feature: "free_record_ideas",
    tier: "small",
    personId: opts.personId,
    messages: [
      {
        role: "system",
        content:
          'Pull Truth Source ideas from this practice discussion. Return JSON only: {"ideas":["..."]}. Only ideas clearly said in the transcript. Empty array if none.',
      },
      { role: "user", content: transcript },
    ],
  });
  if (!result.ok) return { created: 0, ideas: [] };
  const parsed = tryParseJson<{ ideas?: string[] }>(result.text);
  const ideas = (parsed?.ideas ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 12)
    .slice(0, 8);
  let created = 0;
  for (const text of ideas) {
    await createProposal({
      teamId: opts.teamId,
      caseId: opts.caseId,
      personId: opts.personId,
      text,
      origin: "transcript",
      originRef: opts.roundId,
      kind: "other",
    });
    created += 1;
  }
  await logActivity({
    person_id: opts.personId,
    action: "free_record_ideas",
    target: opts.roundId,
    meta: { created },
  });
  return { created, ideas };
}

/** During conferral, scratch paper only: flag if transcript lines appeared in the window. */
export async function checkConferralSilence(opts: {
  roundId: string;
  conferralStartMs: number;
  conferralEndMs: number;
}): Promise<{ spoke: boolean; speakers: string[] }> {
  const lines = await getTranscript(opts.roundId);
  const during = lines.filter(
    (l) =>
      l.start_ms >= opts.conferralStartMs &&
      l.start_ms <= opts.conferralEndMs &&
      l.text.trim().length > 0,
  );
  const speakers = [
    ...new Set(
      during
        .map((l) => l.speaker_label)
        .filter((s): s is string => Boolean(s)),
    ),
  ];
  return { spoke: during.length > 0, speakers };
}

export async function checkQaRoutingAnswer(opts: {
  teamId: string;
  questionKind: QaQuestionKind;
  speakerPersonId: string | null;
  roundId: string;
  actorId: string;
}): Promise<{
  expectedPersonId: string | null;
  expectedName: string | null;
  matched: boolean | null;
}> {
  const routes = await listQaRouting(opts.teamId);
  const route = routes.find((r) => r.question_kind === opts.questionKind);
  if (!route) {
    return { expectedPersonId: null, expectedName: null, matched: null };
  }
  const person = await getPersonById(route.person_id);
  const matched = opts.speakerPersonId
    ? opts.speakerPersonId === route.person_id
    : null;
  await logActivity({
    person_id: opts.actorId,
    action: "qa_routing_checked",
    target: opts.roundId,
    meta: {
      kind: opts.questionKind,
      expected: route.person_id,
      speaker: opts.speakerPersonId,
      matched,
    },
  });
  return {
    expectedPersonId: route.person_id,
    expectedName: person?.name ?? null,
    matched,
  };
}

export async function teamMemberOptions(teamId: string) {
  const people = await listPeopleFull();
  return people
    .filter((p) => p.team_id === teamId && p.role === "member")
    .map((p) => ({ id: p.id, name: p.name }));
}

export async function assertRoundAccess(roundId: string) {
  return getRoundById(roundId);
}
