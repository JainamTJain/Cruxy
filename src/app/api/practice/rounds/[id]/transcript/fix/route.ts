import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getRoundById } from "@/lib/db/practice-repository";
import { learnFromTranscriptFix } from "@/lib/practice/glossary-extra";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: roundId } = await ctx.params;
  const round = await getRoundById(roundId);
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    lineId?: string;
    newText?: string;
    correctTerm?: string;
    misheardForm?: string;
  };
  if (!body.lineId || !body.newText || !body.correctTerm || !body.misheardForm) {
    return NextResponse.json(
      { error: "lineId, newText, correctTerm, and misheardForm are required" },
      { status: 400 },
    );
  }

  const line = await learnFromTranscriptFix({
    lineId: body.lineId,
    newText: body.newText,
    correctTerm: body.correctTerm.trim(),
    misheardForm: body.misheardForm.trim(),
    caseId: round.case_id,
    personId: session.personId,
  });

  return NextResponse.json({ ok: true, line });
}
