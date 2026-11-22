import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import { buildMinutesSession, type MinutesBudget } from "@/lib/team/solo-prep";
import {
  getMyParts,
  setPartDone,
  whatChangedSince,
} from "@/lib/team/solo-prep-repository";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const teamId = person.team_id ?? session.teamId;
  if (!teamId) {
    return NextResponse.json({ error: "No team" }, { status: 400 });
  }
  const url = new URL(req.url);
  const budgetRaw = url.searchParams.get("budget");
  const caseId = url.searchParams.get("caseId");
  const parts = await getMyParts({ personId: person.id, teamId });
  const budget = ([10, 20, 45] as MinutesBudget[]).includes(
    Number(budgetRaw) as MinutesBudget,
  )
    ? (Number(budgetRaw) as MinutesBudget)
    : null;
  const sessionBlocks = budget
    ? buildMinutesSession({ budget, parts })
    : null;

  let changed: { line: string; lastSeenAt: string | null } | null = null;
  if (caseId) {
    changed = await whatChangedSince({
      personId: person.id,
      teamId,
      caseId,
    });
  }

  return NextResponse.json({
    parts,
    me: { id: person.id, name: person.name, teamId },
    session: sessionBlocks,
    budget,
    changed,
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const teamId = person.team_id ?? session.teamId;
  if (!teamId) {
    return NextResponse.json({ error: "No team" }, { status: 400 });
  }
  const body = (await req.json()) as {
    caseId?: string;
    part?: string;
    done?: boolean;
    minutesSpent?: number;
  };
  if (!body.caseId || !body.part || typeof body.done !== "boolean") {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  const allowed = ["presentation", "commentary", "response", "judges"] as const;
  if (!allowed.includes(body.part as (typeof allowed)[number])) {
    return NextResponse.json({ error: "Unknown part" }, { status: 400 });
  }
  await setPartDone({
    personId: person.id,
    teamId,
    caseId: body.caseId,
    part: body.part as (typeof allowed)[number],
    done: body.done,
    minutesSpent: body.minutesSpent,
  });
  const parts = await getMyParts({ personId: person.id, teamId });
  return NextResponse.json({ ok: true, parts });
}
