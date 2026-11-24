/**
 * Cache of Cruxy-compressed one-pager section lines, keyed by content hash.
 * Sample mode keeps an in-process map; Supabase persists across deploys.
 */
import "server-only";

import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import type { WorkingSectionKey } from "@/lib/db/supabase/working-doc-extra";

const memory = new Map<string, string>();

export async function getCompressedSection(
  hash: string,
): Promise<string | null> {
  const mem = memory.get(hash);
  if (mem) return mem;
  if (isSampleDataMode()) return null;
  try {
    const sb = getServiceSupabase();
    const { data, error } = await sb
      .from("one_pager_compress_cache")
      .select("compressed")
      .eq("content_hash", hash)
      .maybeSingle();
    if (error || !data) return null;
    const text = (data as { compressed: string }).compressed;
    memory.set(hash, text);
    return text;
  } catch {
    return null;
  }
}

export async function putCompressedSection(opts: {
  hash: string;
  sectionKey: WorkingSectionKey;
  source: string;
  compressed: string;
  caseId: string;
  teamId: string;
}): Promise<void> {
  memory.set(opts.hash, opts.compressed);
  if (isSampleDataMode()) return;
  try {
    const sb = getServiceSupabase();
    await sb.from("one_pager_compress_cache").upsert(
      {
        id: randomUUID(),
        content_hash: opts.hash,
        section_key: opts.sectionKey,
        source_preview: opts.source.slice(0, 200),
        compressed: opts.compressed,
        case_id: opts.caseId,
        team_id: opts.teamId,
        created_at: new Date().toISOString(),
      },
      { onConflict: "content_hash", ignoreDuplicates: true },
    );
  } catch {
    // Cache is best-effort; derivation still works without it.
  }
}
