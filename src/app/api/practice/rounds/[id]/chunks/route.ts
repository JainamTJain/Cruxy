import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getRecordingForRound,
  getRoundById,
  saveRecording,
} from "@/lib/db/practice-repository";
import {
  CHUNK_DURATION_MS,
  chunkPath,
  newRecording,
  nextChunkIndex,
  saveChunk,
} from "@/lib/practice/recording";
import { nowIso } from "@/lib/utils";

/**
 * Chunked resumable upload. Client sends 30s webm blobs.
 * Killing the browser loses at most one unfinished chunk (~30s).
 */
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

  // Text-only members never record from their device
  // (consent check lives on person; enforce via header from client + server person)
  const { getPersonById } = await import("@/lib/db/repository");
  const person = await getPersonById(session.personId);
  if (person && !person.recording_ok && person.consent_version) {
    return NextResponse.json(
      { error: "Text-only consent — this device does not record" },
      { status: 403 },
    );
  }

  const form = await req.formData();
  const file = form.get("chunk");
  const indexRaw = form.get("index");
  if (!(file instanceof Blob) || indexRaw == null) {
    return NextResponse.json(
      { error: "chunk and index required" },
      { status: 400 },
    );
  }
  const index = Number(indexRaw);
  if (!Number.isFinite(index) || index < 0) {
    return NextResponse.json({ error: "Invalid index" }, { status: 400 });
  }

  let recording = await getRecordingForRound(roundId);
  if (!recording) {
    recording = newRecording(roundId, session.personId);
  }

  // Resume: if client sends an index already stored, acknowledge without rewrite
  const existing = recording.chunk_meta.find((c) => c.index === index);
  if (existing) {
    return NextResponse.json({
      ok: true,
      index,
      nextIndex: nextChunkIndex(recording),
      maxLossMs: CHUNK_DURATION_MS,
      resumed: true,
    });
  }

  const expected = nextChunkIndex(recording);
  if (index !== expected && index !== expected - 1) {
    // Allow gap-fill only for next expected; client should resume from nextIndex
    return NextResponse.json(
      {
        error: "Out of order chunk",
        nextIndex: expected,
        maxLossMs: CHUNK_DURATION_MS,
      },
      { status: 409 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const saved = await saveChunk({ roundId, index, bytes: buf });
  recording = {
    ...recording,
    status: "recording",
    chunk_paths: [...recording.chunk_paths.filter((_, i) => {
      const meta = recording!.chunk_meta[i];
      return !meta || meta.index !== index;
    }), saved.path],
    chunk_meta: [
      ...recording.chunk_meta.filter((c) => c.index !== index),
      { index, bytes: saved.bytes, uploaded_at: nowIso() },
    ].sort((a, b) => a.index - b.index),
  };
  // Rebuild paths in index order
  recording.chunk_paths = recording.chunk_meta.map((c) =>
    chunkPath(roundId, c.index),
  );

  await saveRecording(recording);

  return NextResponse.json({
    ok: true,
    index,
    nextIndex: nextChunkIndex(recording),
    bytes: saved.bytes,
    maxLossMs: CHUNK_DURATION_MS,
    resumed: false,
  });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: roundId } = await ctx.params;
  const recording = await getRecordingForRound(roundId);
  return NextResponse.json({
    nextIndex: recording ? nextChunkIndex(recording) : 0,
    chunks: recording?.chunk_meta.length ?? 0,
    status: recording?.status ?? null,
    deleted_at: recording?.deleted_at ?? null,
    maxLossMs: CHUNK_DURATION_MS,
  });
}
