import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import { enrollVoiceprint } from "@/lib/voice/enrollment";
import type { EnrollmentPartId } from "@/lib/voice/types";
import { HARVARD_ENROLLMENT } from "@/lib/voice/harvard";

export const runtime = "nodejs";

const PARTS: EnrollmentPartId[] = ["read", "natural", "competition"];

/**
 * Three-part voiceprint enrollment.
 * Multipart fields: read, natural, competition (audio), heardText (read transcript).
 * Replaces the previous voiceprint only when all quality checks pass.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Person not found" }, { status: 404 });
  }
  if (!person.recording_ok) {
    return NextResponse.json(
      { error: "Turn on recording consent before enrolling a voice." },
      { status: 400 },
    );
  }

  const form = await req.formData();
  const heardText = String(form.get("heardText") ?? "");
  const parts: { part: EnrollmentPartId; bytes: Buffer; heardText?: string }[] =
    [];

  for (const id of PARTS) {
    const file = form.get(id);
    if (!file || !(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: `Missing audio for ${id}.`, part: id },
        { status: 400 },
      );
    }
    parts.push({
      part: id,
      bytes: Buffer.from(await file.arrayBuffer()),
      heardText: id === "read" ? heardText : undefined,
    });
  }

  const result = await enrollVoiceprint({
    personId: session.personId,
    parts,
    previousSamplePath: person.voice_sample_path,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        parts: result.parts,
        consistency: result.consistency,
        readPassage: HARVARD_ENROLLMENT.text,
      },
      { status: 422 },
    );
  }

  return NextResponse.json({ ok: true, meta: result.meta });
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { getVoiceprint } = await import("@/lib/voice/repository");
  const vp = await getVoiceprint(session.personId);
  return NextResponse.json({
    enrolled: Boolean(vp),
    at: vp?.at ?? null,
    meta: vp?.meta ?? null,
    readPassage: HARVARD_ENROLLMENT,
  });
}
