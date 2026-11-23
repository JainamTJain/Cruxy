import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  createSession,
  listCases,
  listSessions,
} from "@/lib/db/practice-repository";
import { listTeams } from "@/lib/db/repository";
import type { PracticeMode, SessionKind } from "@/lib/practice/types";
import { appToday } from "@/lib/time/app-day";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = session.adminView && (session.role === "tech_admin" || session.role === "coach_admin");
  const sessions = await listSessions({ admin, forPersonId: session.personId });
  const cases = await listCases();
  const teams = await listTeams();
  return NextResponse.json({
    sessions: sessions.map((s) => ({
      ...s,
      // Never expose code_hash to non-admins
      code_hash: admin ? s.code_hash : undefined,
    })),
    cases,
    teams,
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    kind?: SessionKind;
    title?: string;
    date?: string;
    place?: string | null;
    online?: boolean;
    mode?: PracticeMode | null;
    inviteTeamIds?: string[];
    rounds?: {
      caseId: string | null;
      caseNumber: number | null;
      teamIds: string[];
      sides: { presenting: string | null; commenting: string | null };
      moderator: "cruxy" | string | null;
      judges: { humans: string[]; cruxy: boolean };
      mode: PracticeMode;
      timings?: Record<string, number>;
    }[];
  };

  const kind: SessionKind =
    body.kind ??
    (session.adminView &&
    (session.role === "tech_admin" || session.role === "coach_admin")
      ? "admin"
      : "member_practice");

  if (kind === "admin" && !session.adminView) {
    return NextResponse.json(
      { error: "Only admins can create admin sessions" },
      { status: 403 },
    );
  }

  const rounds = body.rounds?.length
    ? body.rounds
    : [
        {
          caseId: null,
          caseNumber: null,
          teamIds: session.teamId ? [session.teamId] : [],
          sides: {
            presenting: session.teamId,
            commenting: null,
          },
          moderator: "cruxy" as const,
          judges: { humans: [], cruxy: true },
          mode: (body.mode ?? "solo_speech") as PracticeMode,
        },
      ];

  const created = await createSession({
    kind,
    title: body.title ?? (kind === "admin" ? "Admin session" : "Practice"),
    date: body.date ?? appToday(),
    place: body.place ?? null,
    online: body.online ?? false,
    createdBy: session.personId,
    mode: body.mode ?? rounds[0]?.mode ?? null,
    inviteTeamIds: body.inviteTeamIds ?? [],
    rounds,
  });

  const isAdmin =
    session.adminView &&
    (session.role === "tech_admin" || session.role === "coach_admin");

  return NextResponse.json({
    session: {
      ...created.session,
      // Decisions: session codes are visible to admins only.
      // Members share the session link or use Invite on the session page.
      code: isAdmin ? created.plainCode : null,
      code_hash: undefined,
      joinPath: `/practice/sessions/${created.session.id}`,
    },
    rounds: created.rounds,
  });
}
