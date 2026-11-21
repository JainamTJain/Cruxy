import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { RecordingRow } from "@/lib/practice/types";
import { nowIso } from "@/lib/utils";

const AUDIO_ROOT = path.join(process.cwd(), ".data", "audio");

/** Max audio loss on crash: 30s chunks. */
export const CHUNK_DURATION_MS = 30_000;

export async function ensureAudioDir(roundId: string) {
  const dir = path.join(AUDIO_ROOT, roundId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function chunkPath(roundId: string, index: number) {
  return path.join(AUDIO_ROOT, roundId, `chunk-${String(index).padStart(4, "0")}.webm`);
}

export async function saveChunk(opts: {
  roundId: string;
  index: number;
  bytes: Buffer;
}): Promise<{ path: string; bytes: number }> {
  await ensureAudioDir(opts.roundId);
  const file = chunkPath(opts.roundId, opts.index);
  await fs.writeFile(file, opts.bytes);
  return { path: file, bytes: opts.bytes.length };
}

export function newRecording(roundId: string, createdBy: string | null): RecordingRow {
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

/**
 * Delete all audio chunks for a recording after transcript is saved.
 * Leaves the recording row with deleted_at set and empty chunk_paths.
 */
export async function deleteRecordingAudio(
  recording: RecordingRow,
): Promise<RecordingRow> {
  for (const p of recording.chunk_paths) {
    try {
      await fs.unlink(p);
    } catch {
      // already gone
    }
  }
  const dir = path.join(AUDIO_ROOT, recording.round_id);
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
  return {
    ...recording,
    chunk_paths: [],
    chunk_meta: [],
    status: "ready",
    deleted_at: nowIso(),
  };
}

/** Nightly backstop: delete any audio older than 24h. */
export async function deleteStaleAudio(olderThanMs = 24 * 60 * 60 * 1000) {
  try {
    const entries = await fs.readdir(AUDIO_ROOT, { withFileTypes: true });
    const cutoff = Date.now() - olderThanMs;
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const dir = path.join(AUDIO_ROOT, e.name);
      const st = await fs.stat(dir);
      if (st.mtimeMs < cutoff) {
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  } catch {
    // no audio root yet
  }
}

export async function concatChunksToBuffer(
  recording: RecordingRow,
): Promise<Buffer> {
  const parts: Buffer[] = [];
  for (const p of recording.chunk_paths) {
    parts.push(await fs.readFile(p));
  }
  return Buffer.concat(parts);
}

export async function audioStillExists(recording: RecordingRow): Promise<boolean> {
  if (recording.deleted_at) return false;
  for (const p of recording.chunk_paths) {
    try {
      await fs.access(p);
      return true;
    } catch {
      // continue
    }
  }
  return false;
}
