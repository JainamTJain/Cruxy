import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  createSession,
  findOpenDrillRound,
  listCases,
} from "@/lib/db/practice-repository";
import { getPersonById } from "@/lib/db/repository";
import type { PracticeMode } from "@/lib/practice/types";

const DRILL_MODES: PracticeMode[] = [
  "moderator_drill",
  "commentary_drill",
  "judges_qa_drill",
  "free_record",
  "conferral_drill",
  "qa_routing",
  "thesis_30",
  "solo_speech",
];

/** Create or resume a member practice session + round for a drill. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    mode?: PracticeMode;
    caseId?: string | null;
    /** When true, always create a fresh round (default: resume open). */
    forceNew?: boolean;
  };
  if (!body.mode || !DRILL_MODES.includes(body.mode)) {
    return NextResponse.json({ error: "Unknown drill mode" }, { status: 400 });
  }

  const cases = await listCases();
  const active = cases.filter((c) => c.active);
  const caseRow =
    (body.caseId ? cases.find((c) => c.id === body.caseId) : null) ??
    active[0] ??
    null;

  if (!body.forceNew) {
    const open = await findOpenDrillRound({
      personId: person.id,
      mode: body.mode,
      caseId: body.caseId ?? null,
    });
    if (open) {
      const caseMeta = open.round.case_id
        ? cases.find((c) => c.id === open.round.case_id)
        : caseRow;
      return NextResponse.json({
        sessionId: open.session.id,
        roundId: open.round.id,
        caseId: open.round.case_id,
        caseNumber: open.round.case_number ?? caseMeta?.number ?? null,
        caseTitle: caseMeta?.title ?? null,
        teamId: person.team_id,
        recordingOk: Boolean(person.recording_ok),
        resumed: true,
        checkpoint: open.round.drill_checkpoint ?? null,
        phase: open.round.phase,
        phaseEnteredAt: open.round.phase_entered_at ?? null,
      });
    }
  }

  const labels: Record<string, string> = {
    moderator_drill: "Moderator drill",
    commentary_drill: "Commentary drill",
    judges_qa_drill: "Judges' Q&A drill",
    free_record: "Free record",
    conferral_drill: "Conferral drill",
    qa_routing: "Q&A routing",
    thesis_30: "Thesis in 30s",
    solo_speech: "Solo speech",
  };

  const created = await createSession({
    kind: "member_practice",
    title: labels[body.mode] ?? "Drill",
    date: new Date().toISOString().slice(0, 10),
    place: null,
    online: true,
    createdBy: person.id,
    mode: body.mode,
    inviteTeamIds: person.team_id ? [person.team_id] : [],
    rounds: [
      {
        caseId: caseRow?.id ?? null,
        caseNumber: caseRow?.number ?? null,
        teamIds: person.team_id ? [person.team_id] : [],
        sides: {
          presenting: person.team_id,
          commenting: null,
        },
        moderator: "cruxy",
        judges: { humans: [], cruxy: true },
        mode: body.mode,
      },
    ],
  });

  const round = created.rounds[0];
  if (!round) {
    return NextResponse.json({ error: "Round missing" }, { status: 500 });
  }

  return NextResponse.json({
    sessionId: created.session.id,
    roundId: round.id,
    caseId: round.case_id,
    caseNumber: round.case_number,
    caseTitle: caseRow?.title ?? null,
    teamId: person.team_id,
    recordingOk: Boolean(person.recording_ok),
    resumed: false,
    checkpoint: null,
    phase: round.phase,
    phaseEnteredAt: round.phase_entered_at ?? null,
  });
}
