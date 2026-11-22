import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { confirmSpeakerLabels } from "@/lib/practice/pipeline";
import {
  listPendingForRound,
  resolveSpeakerMatchPending,
} from "@/lib/voice/repository";
import { createSignedDownloadUrl, downloadBytes } from "@/lib/ops/storage";
import { decodeToPcm16k } from "@/lib/voice/audio";
import { refineVoiceprintFromClip } from "@/lib/voice/enrollment";
import { getSpeakerConfirm } from "@/lib/db/practice-repository";
import { removePaths } from "@/lib/ops/storage";

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
  const rows = await listPendingForRound(id);
  const pending = await Promise.all(
    rows.map(async (r) => {
      let clip_url: string | null = null;
      if (r.clip_path) {
        clip_url = await createSignedDownloadUrl("audio-chunks", r.clip_path);
      }
      return {
        id: r.id,
        speaker_label: r.speaker_label,
        clip_url,
        candidates: r.candidates,
      };
    }),
  );
  return NextResponse.json({ pending });
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
  const { id: roundId } = await ctx.params;
  const body = (await req.json()) as {
    pendingId?: string;
    personId?: string;
  };
  if (!body.pendingId || !body.personId) {
    return NextResponse.json(
      { error: "pendingId and personId required" },
      { status: 400 },
    );
  }

  const pending = (await listPendingForRound(roundId)).find(
    (p) => p.id === body.pendingId,
  );
  if (!pending) {
    return NextResponse.json({ error: "Pending match not found" }, { status: 404 });
  }

  const resolved = await resolveSpeakerMatchPending({
    id: body.pendingId,
    personId: body.personId,
  });

  // Update transcript speaker labels for this diarized label.
  const existing = await getSpeakerConfirm(roundId);
  const mappings = (existing?.mappings ?? []).map(
    (m: { speaker_label: string; person_id: string | null }) =>
      m.speaker_label === pending.speaker_label
        ? {
            speaker_label: m.speaker_label,
            person_id: body.personId!,
            confidence: 1,
            source: "manual" as const,
          }
        : m,
  );
  if (!mappings.some((m) => m.speaker_label === pending.speaker_label)) {
    mappings.push({
      speaker_label: pending.speaker_label,
      person_id: body.personId,
      confidence: 1,
      source: "manual",
    });
  }
  await confirmSpeakerLabels({
    roundId,
    mappings,
    confirmedBy: session.personId,
  });

  // Refine voiceprint from the 5s clip, then delete the clip.
  if (pending.clip_path) {
    const bytes = await downloadBytes("audio-chunks", pending.clip_path);
    if (bytes) {
      const pcm = await decodeToPcm16k(bytes);
      if (pcm) {
        await refineVoiceprintFromClip({
          personId: body.personId,
          clipPcm: pcm,
        });
      }
    }
    await removePaths("audio-chunks", [pending.clip_path]);
  }

  return NextResponse.json({ ok: true, resolved });
}
