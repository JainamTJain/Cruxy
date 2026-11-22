import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import type { SessionPayload } from "@/lib/types";
import { confirmSpeakerLabels } from "@/lib/practice/pipeline";
import {
  listPendingForRound,
  resolveSpeakerMatchPending,
} from "@/lib/voice/repository";
import { createSignedDownloadUrl, downloadBytes } from "@/lib/ops/storage";
import { decodeToPcm16k } from "@/lib/voice/audio";
import { refineVoiceprintFromClip } from "@/lib/voice/enrollment";
import {
  getRoundById,
  getSpeakerConfirm,
  listAttendance,
} from "@/lib/db/practice-repository";
import { removePaths } from "@/lib/ops/storage";
import { getPersonById } from "@/lib/db/repository";
import { isAdminViewer } from "@/lib/ops/privacy-scope";
import { isAdminRole } from "@/lib/admin/permissions";

export const runtime = "nodejs";

async function canAccessRoundSpeakers(
  session: SessionPayload,
  roundId: string,
): Promise<boolean> {
  const me = await getPersonById(session.personId);
  if (isAdminViewer(me, session) || (me && isAdminRole(me.role))) return true;

  const round = await getRoundById(roundId);
  if (!round) return false;
  const teamIds = new Set(
    [
      round.sides.presenting,
      round.sides.commenting,
      ...(round.team_ids ?? []),
    ].filter((x): x is string => Boolean(x)),
  );
  if (me?.team_id && teamIds.has(me.team_id)) return true;
  if (round.created_by === session.personId) return true;

  const attendance = await listAttendance(round.session_id);
  return attendance.some(
    (a) =>
      a.person_id === session.personId &&
      (a.status === "present" || a.status === "late"),
  );
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!(await canAccessRoundSpeakers(session, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rows = await listPendingForRound(id);
  const pending = await Promise.all(
    rows.map(async (r) => {
      let clip_url: string | null = null;
      if (r.clip_path) {
        // Short-lived signed URL from private audio-chunks (never public).
        clip_url = await createSignedDownloadUrl(
          "audio-chunks",
          r.clip_path,
          15 * 60,
        );
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
