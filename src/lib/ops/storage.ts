import "server-only";
import { isSampleDataMode } from "@/lib/db/config";
import { getServiceSupabase } from "@/lib/db/supabase/client";

export type OpsBucket =
  | "audio-chunks"
  | "voice-samples"
  | "backups"
  | "crux-uploads";

/** In-memory stand-in for sample / local mode (never writes the Vercel FS). */
const sampleBlobs = new Map<string, Uint8Array>();

function sampleKey(bucket: OpsBucket, path: string) {
  return `${bucket}:${path}`;
}

export async function uploadBytes(opts: {
  bucket: OpsBucket;
  path: string;
  bytes: Uint8Array | Buffer;
  contentType: string;
  upsert?: boolean;
}): Promise<{ path: string }> {
  if (isSampleDataMode()) {
    sampleBlobs.set(
      sampleKey(opts.bucket, opts.path),
      opts.bytes instanceof Buffer ? new Uint8Array(opts.bytes) : opts.bytes,
    );
    return { path: opts.path };
  }

  const sb = getServiceSupabase();
  const { error } = await sb.storage.from(opts.bucket).upload(opts.path, opts.bytes, {
    contentType: opts.contentType,
    upsert: opts.upsert ?? true,
  });
  if (error) throw new Error(`storage.upload ${opts.bucket}/${opts.path}: ${error.message}`);
  return { path: opts.path };
}

export async function removePaths(
  bucket: OpsBucket,
  paths: string[],
): Promise<{ removed: number }> {
  const clean = paths.filter((p) => Boolean(p?.trim()));
  if (!clean.length) return { removed: 0 };

  if (isSampleDataMode()) {
    let removed = 0;
    for (const p of clean) {
      if (sampleBlobs.delete(sampleKey(bucket, p))) removed += 1;
    }
    return { removed };
  }

  const sb = getServiceSupabase();
  const { error } = await sb.storage.from(bucket).remove(clean);
  if (error) throw new Error(`storage.remove ${bucket}: ${error.message}`);
  return { removed: clean.length };
}

export async function listPrefix(
  bucket: OpsBucket,
  prefix: string,
): Promise<{ name: string; id: string | null; updatedAt: string | null }[]> {
  if (isSampleDataMode()) {
    const needle = sampleKey(bucket, prefix);
    const out: { name: string; id: string | null; updatedAt: string | null }[] = [];
    for (const key of sampleBlobs.keys()) {
      if (key.startsWith(needle) || key.startsWith(`${bucket}:${prefix}`)) {
        out.push({
          name: key.slice(bucket.length + 1),
          id: null,
          updatedAt: null,
        });
      }
    }
    return out;
  }

  const sb = getServiceSupabase();
  const { data, error } = await sb.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: "updated_at", order: "asc" },
  });
  if (error) throw new Error(`storage.list ${bucket}/${prefix}: ${error.message}`);
  return (data ?? []).map((f) => ({
    name: prefix ? `${prefix.replace(/\/$/, "")}/${f.name}` : f.name,
    id: f.id ?? null,
    updatedAt: f.updated_at ?? f.created_at ?? null,
  }));
}

export async function createSignedDownloadUrl(
  bucket: OpsBucket,
  path: string,
  expiresInSeconds = 60 * 60,
): Promise<string | null> {
  if (isSampleDataMode()) {
    return `sample://${bucket}/${path}`;
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw new Error(`storage.signedUrl: ${error.message}`);
  return data?.signedUrl ?? null;
}

/** Test helper: clear in-memory sample blobs. */
export function clearSampleStorage() {
  sampleBlobs.clear();
}
