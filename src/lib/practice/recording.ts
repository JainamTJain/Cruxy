import "server-only";
import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import {
  removePaths,
  uploadBytes,
} from "@/lib/ops/storage";
import type { RecordingRow } from "@/lib/practice/types";
import { nowIso } from "@/lib/utils";

/** 10s chunks (apis.md); a crash loses at most one unfinished chunk. */
export const CHUNK_DURATION_MS = 10_000;

/** Sample-mode bytes keyed by storage object path (never write the Vercel FS). */
const sampleChunkBytes = new Map<string, Buffer>();

export function chunkObjectPath(roundId: string, index: number, ext = "webm") {
  return `${roundId}/chunk-${String(index).padStart(4, "0")}.${ext}`;
}

/** @deprecated use chunkObjectPath — kept for older callers. */
export function chunkPath(roundId: string, index: number) {
  return chunkObjectPath(roundId, index);
}

export async function ensureAudioDir(_roundId: string) {
  // No-op: audio lives in Supabase Storage (or sample memory), never on disk.
  return "audio-chunks";
}

export async function saveChunk(opts: {
  roundId: string;
  index: number;
  bytes: Buffer;
  contentType?: string;
  ext?: string;
}): Promise<{ path: string; bytes: number }> {
  const ext = opts.ext ?? (opts.contentType?.includes("mp4") ? "mp4" : "webm");
  const objectPath = chunkObjectPath(opts.roundId, opts.index, ext);
  const contentType =
    opts.contentType ??
    (ext === "mp4" ? "audio/mp4" : "audio/webm");

  await uploadBytes({
    bucket: "audio-chunks",
    path: objectPath,
    bytes: opts.bytes,
    contentType,
    upsert: true,
  });

  if (isSampleDataMode()) {
    sampleChunkBytes.set(objectPath, Buffer.from(opts.bytes));
  }

  return { path: objectPath, bytes: opts.bytes.length };
}

export function newRecording(
  roundId: string,
  createdBy: string | null,
): RecordingRow {
  return {
    id: randomUUID(),
    round_id: roundId,
    chunk_paths: [],
    chunk_meta: [],
    status: "recording",
    deleted_at: null,
    transcript_job_id: null,
    created_at: nowIso(),
    created_by: createdBy,
  };
}

/** Resume: next chunk index from existing meta. */
export function nextChunkIndex(recording: RecordingRow): number {
  if (recording.chunk_meta.length === 0) return 0;
  return Math.max(...recording.chunk_meta.map((c) => c.index)) + 1;
}

/** Max loss bound in ms from chunking strategy. */
export function maxLossMs(): number {
  return CHUNK_DURATION_MS;
}

async function readObjectBytes(objectPath: string): Promise<Buffer> {
  if (isSampleDataMode()) {
    const hit = sampleChunkBytes.get(objectPath);
    if (hit) return hit;
    throw new Error(`sample audio missing: ${objectPath}`);
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb.storage
    .from("audio-chunks")
    .download(objectPath);
  if (error || !data) {
    throw new Error(
      `audio download ${objectPath}: ${error?.message ?? "empty"}`,
    );
  }
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Delete all audio chunks for a recording after transcript is saved.
 * Leaves the recording row with deleted_at set and empty chunk_paths.
 */
export async function deleteRecordingAudio(
  recording: RecordingRow,
): Promise<RecordingRow> {
  const keys = recording.chunk_paths.filter(Boolean);
  if (keys.length) {
    await removePaths("audio-chunks", keys);
  }
  for (const k of keys) sampleChunkBytes.delete(k);

  return {
    ...recording,
    chunk_paths: [],
    chunk_meta: [],
    status: "ready",
    deleted_at: nowIso(),
  };
}

/** Prefer Workstream I nightly backstop; local no-op for FS leftovers. */
export async function deleteStaleAudio(olderThanMs = 24 * 60 * 60 * 1000) {
  try {
    const { requestStaleAudioCleanup } = await import(
      "@/lib/practice/ops-bridge"
    );
    await requestStaleAudioCleanup();
  } catch {
    // I helper unavailable — ignore.
  }
  void olderThanMs;
}

export async function concatChunksToBuffer(
  recording: RecordingRow,
): Promise<Buffer> {
  const parts: Buffer[] = [];
  for (const p of recording.chunk_paths) {
    parts.push(await readObjectBytes(p));
  }
  return Buffer.concat(parts);
}

export async function audioStillExists(
  recording: RecordingRow,
): Promise<boolean> {
  if (recording.deleted_at) return false;
  for (const p of recording.chunk_paths) {
    if (isSampleDataMode()) {
      if (sampleChunkBytes.has(p)) return true;
      continue;
    }
    try {
      await readObjectBytes(p);
      return true;
    } catch {
      // continue
    }
  }
  return false;
}

/** Test helper: drop in-memory sample chunks. */
export function clearSampleChunkBytes() {
  sampleChunkBytes.clear();
}
