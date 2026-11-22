/**
 * Wave 9 E: solo mock round helpers (APPE phase timings + Cruxy roles).
 */
import "server-only";
import { callCruxy } from "@/lib/cruxy/callCruxy";
import {
  generateJudgesQaQuestions,
  listClaimTextsForDrill,
  pickModeratorQuestion,
} from "@/lib/practice/drills-extra";
import { DEFAULT_ROUND_TIMINGS } from "@/lib/practice/types";
import {
  createSession,
  getRoundById,
  getTranscript,
  listCases,
} from "@/lib/db/practice-repository";
import { getPersonById, logActivity } from "@/lib/db/repository";
import { runCruxyJudge } from "@/lib/practice/cruxy-judge";
import { appToday } from "@/lib/time/app-day";

export type SoloMockPhaseId =
  | "moderator"
  | "presentation"
  | "commentary"
  | "response"
  | "judges"
  | "scoring";

/** APPE regional phase lengths in seconds (from DEFAULT_ROUND_TIMINGS + short response). */
export const SOLO_MOCK_PHASE_SECONDS: Record<
  Exclude<SoloMockPhaseId, "scoring" | "moderator">,
  number
> = {
  presentation: DEFAULT_ROUND_TIMINGS.presentation_max * 60,
  commentary: DEFAULT_ROUND_TIMINGS.commentary_max * 60,
  // Response may be shortened to lengthen Q&A (ethics-bowl.md)
  response: 3 * 60,
  judges: DEFAULT_ROUND_TIMINGS.qa_max * 60,
};

export const SOLO_MOCK_PHASE_ORDER: SoloMockPhaseId[] = [
  "moderator",
  "presentation",
  "commentary",
  "response",
  "judges",
  "scoring",
];

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

export async function startSoloMockRound(input: {
  personId: string;
  caseId?: string | null;
}): Promise<{
  sessionId: string;
  roundId: string;
  caseId: string | null;
  caseNumber: number | null;
  caseTitle: string | null;
  teamId: string | null;
  recordingOk: boolean;
  moderatorQuestion: string | null;
  timings: typeof SOLO_MOCK_PHASE_SECONDS;
}> {
  const person = await getPersonById(input.personId);
  if (!person) throw new Error("Person not found");

  const cases = await listCases();
  const active = cases.filter((c) => c.active);
  const caseRow =
    (input.caseId ? cases.find((c) => c.id === input.caseId) : null) ??
    active[0] ??
    null;

  const created = await createSession({
    kind: "member_practice",
    title: "Solo mock round",
    date: appToday(),
    place: null,
    online: true,
    createdBy: person.id,
    mode: "full_round",
    inviteTeamIds: person.team_id ? [person.team_id] : [],
    rounds: [
      {
        caseId: caseRow?.id ?? null,
        caseNumber: caseRow?.number ?? null,
        teamIds: person.team_id ? [person.team_id] : [],
        sides: {
          presenting: person.team_id,
          commenting: null, // Cruxy plays the other team
        },
        moderator: "cruxy",
        judges: { humans: [], cruxy: true },
        mode: "full_round",
      },
    ],
  });

  const round = created.rounds[0];
  if (!round) throw new Error("Could not open mock round");

  const mq = await pickModeratorQuestion({
    personId: person.id,
    caseId: caseRow?.id ?? null,
    sessionKey: `solo-mock:${person.id}`,
  });

  await logActivity({
    person_id: person.id,
    action: "solo_mock_started",
    target: round.id,
    meta: { case_id: caseRow?.id ?? null },
  });

  return {
    sessionId: created.session.id,
    roundId: round.id,
    caseId: caseRow?.id ?? null,
    caseNumber: caseRow?.number ?? null,
    caseTitle: caseRow?.title ?? null,
    teamId: person.team_id,
    recordingOk: Boolean(person.recording_ok),
    moderatorQuestion: mq?.text ?? null,
    timings: SOLO_MOCK_PHASE_SECONDS,
  };
}

/** Cruxy as the commenting team after the person presents. */
export async function generateSoloMockCommentary(opts: {
  personId: string;
  teamId: string | null;
  caseTitle: string;
  caseNumber: number | null;
  caseId: string | null;
  presentationNotes?: string;
}): Promise<{ commentary: string }> {
  const claims =
    opts.caseId && opts.teamId
      ? await listClaimTextsForDrill(opts.teamId, opts.caseId)
      : [];
  const claimBlock =
    claims.slice(0, 6).join("\n- ") ||
    "No claim map yet; push on the central ethical question.";
  const result = await callCruxy({
    feature: "solo_mock_commentary",
    tier: "strong",
    personId: opts.personId,
    messages: [
      {
        role: "system",
        content:
          "You are Cruxy playing the commenting team in an Ethics Bowl solo mock. Write a fair 5 to 8 minute commentary: show you listened, name what was strong, press the hardest gaps, stay collegial. Plain words. Return JSON only: {\"commentary\":\"...\"}.",
      },
      {
        role: "user",
        content: `Case ${opts.caseNumber ?? "?"}: ${opts.caseTitle}\nTeam claims:\n- ${claimBlock}\nPresenter notes (may be empty):\n${opts.presentationNotes?.slice(0, 2000) || "(none)"}`,
      },
    ],
  });
  if (!result.ok) {
    return {
      commentary:
        "Cruxy could not build commentary right now. Try again in a moment, or answer as if the other team asked you to clarify your main principle.",
    };
  }
  const parsed = tryParseJson<{ commentary?: string }>(result.text);
  return {
    commentary:
      parsed?.commentary?.trim() ||
      result.text.trim() ||
      "Cruxy had nothing to say.",
  };
}

export async function generateSoloMockJudges(opts: {
  personId: string;
  teamId: string | null;
  caseTitle: string;
  caseId: string | null;
}) {
  const claims =
    opts.caseId && opts.teamId
      ? await listClaimTextsForDrill(opts.teamId, opts.caseId)
      : [];
  return generateJudgesQaQuestions({
    personId: opts.personId,
    caseTitle: opts.caseTitle,
    claimTexts: claims,
  });
}

/** End mock: run Cruxy judge on whatever transcript exists (or stub lines). */
export async function scoreSoloMockRound(opts: {
  roundId: string;
  personId: string;
  fallbackNotes?: string;
}) {
  const round = await getRoundById(opts.roundId);
  if (!round) throw new Error("Round not found");
  let lines = await getTranscript(opts.roundId);
  if (!lines.length && opts.fallbackNotes?.trim()) {
    // Soft path when nothing was recorded: judge from notes the person typed
    lines = [
      {
        id: `solo-note-${opts.roundId}`,
        round_id: opts.roundId,
        speaker_label: "Presenter",
        speaker_person_id: opts.personId,
        text: opts.fallbackNotes.trim().slice(0, 4000),
        start_ms: 0,
        end_ms: 1000,
        corrected: false,
        created_at: new Date().toISOString(),
      },
    ];
  }
  const judged = await runCruxyJudge({
    round: round,
    lines,
    personId: opts.personId,
  });
  await logActivity({
    person_id: opts.personId,
    action: "solo_mock_scored",
    target: opts.roundId,
    meta: { stub: judged.stub, cards: judged.cards.length },
  });
  return judged;
}
