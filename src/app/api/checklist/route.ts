import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getFirstRunChecklist,
  markChecklistItem,
  type FirstRunKey,
  FIRST_RUN_ITEMS,
} from "@/lib/auth/first-run";
import { nudgeChampionForIncomplete } from "@/lib/auth/first-run";
import { getPersonById } from "@/lib/db/repository";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const data = await getFirstRunChecklist(session.personId);
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as { key?: string; done?: boolean };
  if (!body.key) {
    return NextResponse.json({ error: "Missing key" }, { status: 400 });
  }
  const allowed = new Set(FIRST_RUN_ITEMS.map((i) => i.key));
  if (!allowed.has(body.key as FirstRunKey)) {
    return NextResponse.json({ error: "Unknown key" }, { status: 400 });
  }
  await markChecklistItem(
    session.personId,
    body.key as FirstRunKey,
    body.done !== false,
  );
  const person = await getPersonById(session.personId);
  if (person?.team_id) {
    await nudgeChampionForIncomplete(person.team_id, person.id);
  }
  const data = await getFirstRunChecklist(session.personId);
  return NextResponse.json({
    ok: true,
    checklist: Object.fromEntries(data.items.map((i) => [i.key, i.done])),
    ...data,
  });
}
