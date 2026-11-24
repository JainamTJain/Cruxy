import "server-only";

import { randomUUID } from "crypto";
import type {
  FileSegmentOverride,
  SegmentFallacyCacheRow,
} from "@/lib/case-home/types";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { assertOk, getServiceSupabase } from "@/lib/db/supabase/client";
import { iso, type Row } from "@/lib/db/supabase/util";
import { nowIso } from "@/lib/utils";

export type { FileSegmentOverride, SegmentFallacyCacheRow };

function mapOverride(r: Row): FileSegmentOverride {
  return {
    id: r.id,
    team_id: r.team_id,
    segment_id: r.segment_id,
    body: r.body ?? "",
    original_body: r.original_body ?? "",
    edited_by: r.edited_by ?? null,
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
  };
}

function mapCache(r: Row): SegmentFallacyCacheRow {
  return {
    text_hash: r.text_hash,
    sound: Boolean(r.sound),
    fallacy_name: r.fallacy_name ?? null,
    why: r.why ?? null,
    better_wording: r.better_wording ?? null,
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
  };
}

export async function listOverridesForTeam(
  teamId: string,
  segmentIds?: string[],
): Promise<FileSegmentOverride[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    let rows = store.file_segment_overrides ?? [];
    rows = rows.filter((o) => o.team_id === teamId);
    if (segmentIds) {
      const want = new Set(segmentIds);
      rows = rows.filter((o) => want.has(o.segment_id));
    }
    return rows;
  }
  const sb = getServiceSupabase();
  let q = sb.from("file_segment_overrides").select("*").eq("team_id", teamId);
  if (segmentIds && segmentIds.length) {
    q = q.in("segment_id", segmentIds);
  }
  const { data, error } = await q;
  assertOk(error, "listOverridesForTeam");
  return (data ?? []).map(mapOverride);
}

export async function upsertSegmentOverride(args: {
  teamId: string;
  segmentId: string;
  body: string;
  originalBody: string;
  editedBy: string;
}): Promise<FileSegmentOverride> {
  const now = nowIso();
  if (isSampleDataMode()) {
    let saved: FileSegmentOverride | null = null;
    await updateStore((s) => {
      const list = s.file_segment_overrides ?? [];
      const i = list.findIndex(
        (o) => o.team_id === args.teamId && o.segment_id === args.segmentId,
      );
      if (i >= 0) {
        const prev = list[i]!;
        saved = {
          ...prev,
          body: args.body,
          original_body: prev.original_body || args.originalBody,
          edited_by: args.editedBy,
          updated_at: now,
        };
        list[i] = saved;
      } else {
        saved = {
          id: randomUUID(),
          team_id: args.teamId,
          segment_id: args.segmentId,
          body: args.body,
          original_body: args.originalBody,
          edited_by: args.editedBy,
          created_at: now,
          updated_at: now,
        };
        list.push(saved);
      }
      s.file_segment_overrides = list;
    });
    return saved!;
  }
  const sb = getServiceSupabase();
  const { data: existing, error: findErr } = await sb
    .from("file_segment_overrides")
    .select("*")
    .eq("team_id", args.teamId)
    .eq("segment_id", args.segmentId)
    .maybeSingle();
  assertOk(findErr, "upsertSegmentOverride(find)");
  if (existing) {
    const { data, error } = await sb
      .from("file_segment_overrides")
      .update({
        body: args.body,
        edited_by: args.editedBy,
        updated_at: now,
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    assertOk(error, "upsertSegmentOverride(update)");
    return mapOverride(data);
  }
  const row = {
    id: randomUUID(),
    team_id: args.teamId,
    segment_id: args.segmentId,
    body: args.body,
    original_body: args.originalBody,
    edited_by: args.editedBy,
    created_at: now,
    updated_at: now,
  };
  const { data, error } = await sb
    .from("file_segment_overrides")
    .insert(row)
    .select("*")
    .single();
  assertOk(error, "upsertSegmentOverride(insert)");
  return mapOverride(data);
}

export async function clearSegmentOverride(args: {
  teamId: string;
  segmentId: string;
}): Promise<void> {
  if (isSampleDataMode()) {
    await updateStore((s) => {
      s.file_segment_overrides = (s.file_segment_overrides ?? []).filter(
        (o) =>
          !(o.team_id === args.teamId && o.segment_id === args.segmentId),
      );
    });
    return;
  }
  const { error } = await getServiceSupabase()
    .from("file_segment_overrides")
    .delete()
    .eq("team_id", args.teamId)
    .eq("segment_id", args.segmentId);
  assertOk(error, "clearSegmentOverride");
}

export async function getFallacyCache(
  textHash: string,
): Promise<SegmentFallacyCacheRow | null> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return (
      (store.file_segment_fallacy_cache ?? []).find(
        (r) => r.text_hash === textHash,
      ) ?? null
    );
  }
  const { data, error } = await getServiceSupabase()
    .from("file_segment_fallacy_cache")
    .select("*")
    .eq("text_hash", textHash)
    .maybeSingle();
  assertOk(error, "getFallacyCache");
  return data ? mapCache(data) : null;
}

export async function upsertFallacyCache(
  row: Omit<SegmentFallacyCacheRow, "created_at" | "updated_at"> & {
    created_at?: string;
    updated_at?: string;
  },
): Promise<SegmentFallacyCacheRow> {
  const now = nowIso();
  const next: SegmentFallacyCacheRow = {
    text_hash: row.text_hash,
    sound: row.sound,
    fallacy_name: row.fallacy_name,
    why: row.why,
    better_wording: row.better_wording,
    created_at: row.created_at ?? now,
    updated_at: now,
  };
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const list = s.file_segment_fallacy_cache ?? [];
      const i = list.findIndex((r) => r.text_hash === next.text_hash);
      if (i >= 0) {
        list[i] = { ...list[i]!, ...next, created_at: list[i]!.created_at };
      } else {
        list.push(next);
      }
      s.file_segment_fallacy_cache = list;
    });
    return next;
  }
  const { data, error } = await getServiceSupabase()
    .from("file_segment_fallacy_cache")
    .upsert(
      {
        text_hash: next.text_hash,
        sound: next.sound,
        fallacy_name: next.fallacy_name,
        why: next.why,
        better_wording: next.better_wording,
        updated_at: next.updated_at,
        created_at: next.created_at,
      },
      { onConflict: "text_hash" },
    )
    .select("*")
    .single();
  assertOk(error, "upsertFallacyCache");
  return mapCache(data);
}
