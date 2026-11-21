import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getSpeakerConfirm,
  getTranscript,
} from "@/lib/db/practice-repository";
import { confirmSpeakerLabels } from "@/lib/practice/pipeline";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const row = await getSpeakerConfirm(id);
  if (row) {
    return NextResponse.json({ speakers: row });
  }
  // Prefill from transcript labels (voice samples + roles already mapped in pipeline).
  const lines = await getTranscript(id);
  const byLabel = new Map<string, string | null>();
  for (const l of lines) {
    if (!l.speaker_label) continue;
    if (!byLabel.has(l.speaker_label)) {
      byLabel.set(l.speaker_label, l.speaker_person_id);
    }
  }
  const mappings = [...byLabel.entries()].map(([speaker_label, person_id]) => ({
    speaker_label,
    person_id,
  }));
  return NextResponse.json({
    speakers: {
      round_id: id,
      mappings,
      confirmed_by: null,
      confirmed_at: null,
    },
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin =
    session.adminView &&
    (session.role === "tech_admin" || session.role === "coach_admin");
  if (!admin) {
    return NextResponse.json({ error: "Admin confirm only" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = (await req.json()) as {
    mappings?: { speaker_label: string; person_id: string | null }[];
  };
  if (!body.mappings) {
    return NextResponse.json({ error: "mappings required" }, { status: 400 });
  }
  const lines = await confirmSpeakerLabels({
    roundId: id,
    mappings: body.mappings,
    confirmedBy: session.personId,
  });
  return NextResponse.json({ lines, confirmed: true });
}
