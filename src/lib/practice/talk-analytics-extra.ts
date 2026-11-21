import "server-only";
import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { assertOk, getServiceSupabase } from "@/lib/db/supabase/client";
import { getTranscript, getRoundById } from "@/lib/db/practice-repository";
import { logActivity } from "@/lib/db/repository";
import type { TalkAnalytics, TranscriptLine } from "@/lib/practice/types";
import { nowIso } from "@/lib/utils";

const FILLER_RE =
  /\b(um|uh|erm|ah|like|you know|basically|literally|sort of|kind of)\b/gi;

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

function countFillers(text: string): number {
  const matches = text.match(FILLER_RE);
  return matches?.length ?? 0;
}

/**
 * F-234: talk analytics per person from timestamped transcript lines.
 * WPM uses talk_ms from line spans; interruptions use overlapping speakers.
 */
export function computeTalkAnalyticsFromLines(
  roundId: string,
  lines: TranscriptLine[],
  qaStartMs?: number | null,
): TalkAnalytics[] {
  const byPerson = new Map<
    string,
    {
      talk_ms: number;
      words: number;
      filler_count: number;
      first_answer_ms: number | null;
      interruptions: number;
    }
  >();

  const sorted = [...lines].sort((a, b) => a.start_ms - b.start_ms);
  for (let i = 0; i < sorted.length; i++) {
    const line = sorted[i];
    const personId = line.speaker_person_id;
    if (!personId) continue;
    const cur = byPerson.get(personId) ?? {
      talk_ms: 0,
      words: 0,
      filler_count: 0,
      first_answer_ms: null,
      interruptions: 0,
    };
    const span = Math.max(0, line.end_ms - line.start_ms);
    cur.talk_ms += span;
    cur.words += countWords(line.text);
    cur.filler_count += countFillers(line.text);

    const inQa =
      qaStartMs == null ? true : line.start_ms >= qaStartMs;
    if (inQa && cur.first_answer_ms == null) {
      cur.first_answer_ms = line.start_ms - (qaStartMs ?? 0);
    }

    const prev = sorted[i - 1];
    if (
      prev &&
      prev.speaker_person_id &&
      prev.speaker_person_id !== personId &&
      line.start_ms < prev.end_ms
    ) {
      cur.interruptions += 1;
    }

    byPerson.set(personId, cur);
  }

  return [...byPerson.entries()].map(([person_id, v]) => ({
    person_id,
    round_id: roundId,
    talk_ms: v.talk_ms,
    words: v.words,
    filler_count: v.filler_count,
    time_to_first_answer_ms: v.first_answer_ms,
    interruptions: v.interruptions,
  }));
}

/** Words per minute helper for report UI. */
export function wordsPerMinute(row: TalkAnalytics): number {
  if (row.talk_ms <= 0) return 0;
  return Math.round((row.words * 60_000) / row.talk_ms);
}

export async function upsertTalkAnalytics(
  rows: TalkAnalytics[],
): Promise<void> {
  if (rows.length === 0) return;
  if (isSampleDataMode()) {
    await updateStore((s) => {
      for (const row of rows) {
        const i = s.talk_analytics.findIndex(
          (t) => t.round_id === row.round_id && t.person_id === row.person_id,
        );
        if (i >= 0) s.talk_analytics[i] = row;
        else s.talk_analytics.push(row);
      }
    });
    return;
  }

  const sb = getServiceSupabase();
  // Delete existing rows for these rounds then insert (no unique on person+round).
  const roundIds = [...new Set(rows.map((r) => r.round_id))];
  for (const roundId of roundIds) {
    assertOk(
      (
        await sb.from("talk_analytics").delete().eq("round_id", roundId)
      ).error,
      "upsertTalkAnalytics.delete",
    );
  }
  assertOk(
    (
      await sb.from("talk_analytics").insert(
        rows.map((r) => ({
          id: randomUUID(),
          round_id: r.round_id,
          person_id: r.person_id,
          talk_ms: r.talk_ms,
          words: r.words,
          filler_count: r.filler_count,
          time_to_first_answer_ms: r.time_to_first_answer_ms,
          interruptions: r.interruptions,
          created_at: nowIso(),
        })),
      )
    ).error,
    "upsertTalkAnalytics.insert",
  );
}

/**
 * Compute and persist talk analytics for a finalized round (F-234).
 */
export async function computeAndSaveTalkAnalytics(opts: {
  roundId: string;
  personId?: string | null;
}): Promise<TalkAnalytics[]> {
  const round = await getRoundById(opts.roundId);
  if (!round) throw new Error("Round not found");
  const lines = await getTranscript(opts.roundId);

  // Approximate Q&A start: first line after commentary window, or null.
  const presentationMax = (round.timings.presentation_max ?? 0) * 1000;
  const commentaryMax = (round.timings.commentary_max ?? 0) * 1000;
  const qaStartMs =
    presentationMax + commentaryMax > 0
      ? presentationMax + commentaryMax
      : null;

  const rows = computeTalkAnalyticsFromLines(
    opts.roundId,
    lines,
    qaStartMs,
  );
  await upsertTalkAnalytics(rows);
  await logActivity({
    person_id: opts.personId ?? null,
    action: "talk_analytics_saved",
    target: opts.roundId,
    meta: { people: rows.length },
  });
  return rows;
}

export async function listTalkAnalyticsForRound(
  roundId: string,
): Promise<TalkAnalytics[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return store.talk_analytics.filter((t) => t.round_id === roundId);
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("talk_analytics")
    .select("*")
    .eq("round_id", roundId);
  assertOk(error, "listTalkAnalyticsForRound");
  return (data ?? []).map((r) => ({
    person_id: r.person_id as string,
    round_id: r.round_id as string,
    talk_ms: Number(r.talk_ms ?? 0),
    words: Number(r.words ?? 0),
    filler_count: Number(r.filler_count ?? 0),
    time_to_first_answer_ms:
      r.time_to_first_answer_ms == null
        ? null
        : Number(r.time_to_first_answer_ms),
    interruptions: Number(r.interruptions ?? 0),
  }));
}
