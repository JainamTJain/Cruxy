import "server-only";
import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import { readStore, updateStore } from "@/lib/db/sample-store";
import type { Person } from "@/lib/types";
import type { SpeakerMatchPending, VoiceprintMeta } from "@/lib/voice/types";
import { nowIso } from "@/lib/utils";

type PendingBag = {
  speaker_match_pending?: SpeakerMatchPending[];
};

function mapPending(row: Record<string, unknown>): SpeakerMatchPending {
  return {
    id: String(row.id),
    round_id: String(row.round_id),
    speaker_label: String(row.speaker_label),
    clip_path: (row.clip_path as string | null) ?? null,
    candidates: (row.candidates as SpeakerMatchPending["candidates"]) ?? [],
    embedding: (row.embedding as number[] | null) ?? null,
    created_at: String(row.created_at ?? nowIso()),
    resolved_at: (row.resolved_at as string | null) ?? null,
    resolved_person_id: (row.resolved_person_id as string | null) ?? null,
  };
}

export async function saveVoiceprint(opts: {
  personId: string;
  embedding: number[];
  meta: VoiceprintMeta;
  /** Clear raw sample path after embedding (audio already deleted from storage). */
  clearSamplePath?: boolean;
}): Promise<Person> {
  if (isSampleDataMode()) {
    return updateStore((s) => {
      const p = s.people.find((x) => x.id === opts.personId);
      if (!p) throw new Error("Person not found");
      (p as Person & { voiceprint?: number[]; voiceprint_at?: string; voiceprint_meta?: VoiceprintMeta }).voiceprint =
        opts.embedding;
      (p as Person & { voiceprint_at?: string }).voiceprint_at = opts.meta.enrolled_at;
      (p as Person & { voiceprint_meta?: VoiceprintMeta }).voiceprint_meta = opts.meta;
      if (opts.clearSamplePath) p.voice_sample_path = null;
    }).then(async () => {
      const store = await readStore();
      const p = store.people.find((x) => x.id === opts.personId);
      if (!p) throw new Error("Person not found");
      return p;
    });
  }

  const sb = getServiceSupabase();
  const patch: Record<string, unknown> = {
    voiceprint: opts.embedding,
    voiceprint_at: opts.meta.enrolled_at,
    voiceprint_meta: opts.meta,
  };
  if (opts.clearSamplePath) patch.voice_sample_path = null;
  const { data, error } = await sb
    .from("people")
    .update(patch)
    .eq("id", opts.personId)
    .select("*")
    .single();
  if (error) throw new Error(`saveVoiceprint: ${error.message}`);
  return data as Person;
}

export async function clearVoiceprint(personId: string): Promise<void> {
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const p = s.people.find((x) => x.id === personId);
      if (!p) return;
      const ext = p as Person & {
        voiceprint?: number[] | null;
        voiceprint_at?: string | null;
        voiceprint_meta?: VoiceprintMeta | null;
      };
      ext.voiceprint = null;
      ext.voiceprint_at = null;
      ext.voiceprint_meta = null;
    });
    return;
  }
  const sb = getServiceSupabase();
  const { error } = await sb
    .from("people")
    .update({
      voiceprint: null,
      voiceprint_at: null,
      voiceprint_meta: {},
    })
    .eq("id", personId);
  if (error) throw new Error(`clearVoiceprint: ${error.message}`);
}

export async function getVoiceprint(
  personId: string,
): Promise<{ embedding: number[]; meta: VoiceprintMeta | null; at: string | null } | null> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const p = store.people.find((x) => x.id === personId) as
      | (Person & {
          voiceprint?: number[] | null;
          voiceprint_at?: string | null;
          voiceprint_meta?: VoiceprintMeta | null;
        })
      | undefined;
    if (!p?.voiceprint?.length) return null;
    return {
      embedding: p.voiceprint,
      meta: p.voiceprint_meta ?? null,
      at: p.voiceprint_at ?? null,
    };
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("people")
    .select("voiceprint, voiceprint_at, voiceprint_meta")
    .eq("id", personId)
    .maybeSingle();
  if (error) throw new Error(`getVoiceprint: ${error.message}`);
  if (!data?.voiceprint) return null;
  return {
    embedding: data.voiceprint as number[],
    meta: (data.voiceprint_meta as VoiceprintMeta) ?? null,
    at: (data.voiceprint_at as string) ?? null,
  };
}

export async function listVoiceprintsForPeople(
  personIds: string[],
): Promise<{ personId: string; name: string; embedding: number[] }[]> {
  if (personIds.length === 0) return [];
  if (isSampleDataMode()) {
    const store = await readStore();
    return store.people
      .filter((p) => personIds.includes(p.id))
      .map((p) => {
        const ext = p as Person & { voiceprint?: number[] | null };
        return {
          personId: p.id,
          name: p.name,
          embedding: ext.voiceprint ?? [],
        };
      })
      .filter((x) => x.embedding.length > 0);
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("people")
    .select("id, name, voiceprint")
    .in("id", personIds);
  if (error) throw new Error(`listVoiceprintsForPeople: ${error.message}`);
  return ((data ?? []) as { id: string; name: string; voiceprint: number[] }[])
    .filter((r) => Array.isArray(r.voiceprint) && r.voiceprint.length > 0)
    .map((r) => ({
      personId: r.id,
      name: r.name,
      embedding: r.voiceprint,
    }));
}

export async function upsertSpeakerMatchPending(
  row: Omit<
    SpeakerMatchPending,
    "id" | "created_at" | "resolved_at" | "resolved_person_id"
  > & { id?: string },
): Promise<SpeakerMatchPending> {
  const full: SpeakerMatchPending = {
    id: row.id ?? randomUUID(),
    round_id: row.round_id,
    speaker_label: row.speaker_label,
    clip_path: row.clip_path,
    candidates: row.candidates,
    embedding: row.embedding,
    created_at: nowIso(),
    resolved_at: null,
    resolved_person_id: null,
  };

  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = s as unknown as PendingBag;
      bag.speaker_match_pending = bag.speaker_match_pending ?? [];
      const i = bag.speaker_match_pending.findIndex(
        (p) =>
          p.round_id === full.round_id && p.speaker_label === full.speaker_label,
      );
      if (i >= 0) bag.speaker_match_pending[i] = full;
      else bag.speaker_match_pending.push(full);
    });
    return full;
  }

  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("speaker_match_pending")
    .upsert(
      {
        id: full.id,
        round_id: full.round_id,
        speaker_label: full.speaker_label,
        clip_path: full.clip_path,
        candidates: full.candidates,
        embedding: full.embedding,
        created_at: full.created_at,
        resolved_at: null,
        resolved_person_id: null,
      },
      { onConflict: "round_id,speaker_label" },
    )
    .select("*")
    .single();
  if (error) throw new Error(`upsertSpeakerMatchPending: ${error.message}`);
  return mapPending(data as Record<string, unknown>);
}

export async function listPendingForRound(
  roundId: string,
): Promise<SpeakerMatchPending[]> {
  if (isSampleDataMode()) {
    const store = (await readStore()) as unknown as PendingBag;
    return (store.speaker_match_pending ?? []).filter(
      (p) => p.round_id === roundId && !p.resolved_at,
    );
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("speaker_match_pending")
    .select("*")
    .eq("round_id", roundId)
    .is("resolved_at", null);
  if (error) throw new Error(`listPendingForRound: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => mapPending(r));
}

export async function resolveSpeakerMatchPending(opts: {
  id: string;
  personId: string;
}): Promise<SpeakerMatchPending> {
  if (isSampleDataMode()) {
    let resolved!: SpeakerMatchPending;
    await updateStore((s) => {
      const bag = s as unknown as PendingBag;
      const row = (bag.speaker_match_pending ?? []).find((p) => p.id === opts.id);
      if (!row) throw new Error("Pending match not found");
      row.resolved_at = nowIso();
      row.resolved_person_id = opts.personId;
      resolved = row;
    });
    return resolved;
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("speaker_match_pending")
    .update({
      resolved_at: nowIso(),
      resolved_person_id: opts.personId,
    })
    .eq("id", opts.id)
    .select("*")
    .single();
  if (error) throw new Error(`resolveSpeakerMatchPending: ${error.message}`);
  return mapPending(data as Record<string, unknown>);
}
