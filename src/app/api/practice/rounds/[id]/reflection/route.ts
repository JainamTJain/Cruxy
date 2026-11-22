import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getRoundById } from "@/lib/db/practice-repository";
import {
  getReflectionForRound,
  upsertReflection,
} from "@/lib/learning/reflections";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const reflection = await getReflectionForRound(session.personId, id);
  return NextResponse.json({ reflection });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const round = await getRoundById(id);
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }
  const body = (await req.json()) as {
    wentWell?: string;
    oneChange?: string;
    confidence?: number;
    secondsSpent?: number;
  };
  try {
    const reflection = await upsertReflection({
      personId: session.personId,
      roundId: id,
      caseId: round.case_id,
      wentWell: body.wentWell ?? "",
      oneChange: body.oneChange ?? "",
      confidence: body.confidence ?? 50,
      secondsSpent: body.secondsSpent ?? null,
    });
    return NextResponse.json({ ok: true, reflection });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not save" },
      { status: 400 },
    );
  }
}
