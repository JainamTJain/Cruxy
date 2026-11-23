import { NextResponse } from "next/server";
import {
  canSeeAllTeams,
  resolveVisibleTeamId,
} from "@/lib/auth/team-privacy";
import { requireMemberSession } from "@/lib/case-brain/auth";
import { getCaseHome } from "@/lib/case-home/service";
import { isSampleDataMode } from "@/lib/db/config";
import { listCases, logActivity } from "@/lib/db/repository";
import { assertOk, getServiceSupabase } from "@/lib/db/supabase/client";
import { getCaseBrain } from "@/lib/case-brain/service";
import {
  latestOnePager,
  listFlashcards,
  listQuestions,
} from "@/lib/revision/repository";

type Params = { params: Promise<{ caseId: string }> };

/** Bundle everything a person needs offline for one case. */
export async function GET(req: Request, { params }: Params) {
  const auth = await requireMemberSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { caseId } = await params;
  const url = new URL(req.url);
  const resolved = resolveVisibleTeamId({
    person: auth.person,
    session: auth.session,
    requested: url.searchParams.get("teamId"),
  });
  if (resolved.denied || !resolved.teamId) {
    return NextResponse.json(
      { error: "You can only save your own team's case offline." },
      { status: 403 },
    );
  }
  const teamId = resolved.teamId;

  const cases = await listCases();
  const caseRow = cases.find((c) => c.id === caseId);
  if (!caseRow) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  const seeAll = canSeeAllTeams(auth.person, auth.session);
  const [home, brain, flashcards, questions, onePager, brief] =
    await Promise.all([
      getCaseHome({
        caseId,
        teamId,
        caseRow,
        viewerTeamId: teamId,
        seeAllTeams: seeAll,
      }),
      getCaseBrain(teamId, caseId),
      listFlashcards({ teamId, caseId }),
      listQuestions({ caseId }),
      latestOnePager(teamId, caseId),
      fetchBrief(teamId, caseId),
    ]);

  const pack = {
    caseId,
    caseNumber: caseRow.number,
    title: caseRow.title,
    savedAt: new Date().toISOString(),
    teamId,
    case: caseRow,
    home,
    brief,
    onePager: onePager ?? null,
    flashcards: flashcards.slice(0, 80),
    questions: questions.filter((q) => q.status === "active").slice(0, 40),
    stance: {
      thesis: brief?.thesis ?? null,
      claims: brain.claims.map((n) => ({
        id: n.claim.id,
        text: n.claim.text,
        logic_line: n.claim.logic_line,
      })),
    },
  };

  const body = JSON.stringify(pack);
  const bytes = Buffer.byteLength(body, "utf8");

  if (!isSampleDataMode()) {
    const { error } = await getServiceSupabase()
      .from("offline_case_packs")
      .upsert(
        {
          person_id: auth.session.personId,
          case_id: caseId,
          saved_at: pack.savedAt,
          pack_bytes: bytes,
        },
        { onConflict: "person_id,case_id" },
      );
    assertOk(error, "offline_case_packs upsert");
  }

  await logActivity({
    person_id: auth.session.personId,
    action: "offline_pack_saved",
    target: caseId,
    meta: { bytes, teamId },
  });

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "application/json",
      "Cache-Control": "private, max-age=60",
    },
  });
}

async function fetchBrief(teamId: string, caseId: string) {
  try {
    if (isSampleDataMode()) {
      const { readStore } = await import("@/lib/db/sample-store");
      const store = await readStore();
      const briefs = (
        store as {
          team_briefs?: Array<{
            id: string;
            team_id: string;
            case_id: string;
            mode: string;
            thesis: string | null;
          }>;
        }
      ).team_briefs;
      return (
        briefs?.find((b) => b.team_id === teamId && b.case_id === caseId) ?? null
      );
    }
    const { data, error } = await getServiceSupabase()
      .from("team_briefs")
      .select("id,team_id,case_id,mode,thesis,stance_version,confirmed_by,drift_flag")
      .eq("team_id", teamId)
      .eq("case_id", caseId)
      .maybeSingle();
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}
