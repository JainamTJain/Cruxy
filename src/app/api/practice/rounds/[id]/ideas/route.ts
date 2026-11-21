import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getTranscript } from "@/lib/db/practice-repository";
import {
  queueRoundIdeasToTruthSources,
  suggestIdeasFromTranscript,
} from "@/lib/practice/wave5";

/** F-276: queue new ideas from the round into Truth Sources. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const lines = await getTranscript(id);
  return NextResponse.json({ ideas: suggestIdeasFromTranscript(lines) });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.teamId) {
    return NextResponse.json({ error: "Team required" }, { status: 400 });
  }
  const { id } = await ctx.params;
  const body = (await req.json()) as {
    ideas?: { text: string; lineId: string | null }[];
  };
  const ideas =
    body.ideas ??
    suggestIdeasFromTranscript(await getTranscript(id)).map((i) => ({
      text: i.text,
      lineId: i.lineId,
    }));
  const result = await queueRoundIdeasToTruthSources({
    roundId: id,
    teamId: session.teamId,
    personId: session.personId,
    ideas,
  });
  return NextResponse.json(result);
}
