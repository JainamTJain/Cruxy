import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { logCalmRoutine } from "@/lib/db/supabase/notify-extra";
import { logActivity } from "@/lib/db/repository";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    caseId?: string | null;
    roundId?: string | null;
    completed?: boolean;
    skipped?: boolean;
  };
  const row = await logCalmRoutine({
    personId: session.personId,
    caseId: body.caseId ?? null,
    roundId: body.roundId ?? null,
    completed: Boolean(body.completed),
    skipped: Boolean(body.skipped),
  });
  await logActivity({
    person_id: session.personId,
    action: body.skipped ? "calm_skipped" : "calm_completed",
    target: row.id,
    meta: { caseId: body.caseId ?? null, roundId: body.roundId ?? null },
  });
  return NextResponse.json({ ok: true, id: row.id });
}
