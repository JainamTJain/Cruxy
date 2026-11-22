/**
 * Second signal: AssemblyAI Speaker Identification maps diarized labels to
 * names from conversation content (no voiceprints, no cross-file enrollment).
 * Best-effort: if the API field is absent, returns {}.
 */
import type { TranscriptUtterance } from "@/lib/practice/transcription";

function assemblyAiKey(): string | null {
  const k = process.env.ASSEMBLYAI_API_KEY?.trim();
  return k || null;
}

/**
 * Heuristic name map from utterance text when the paid identification
 * payload is missing: if a known present name appears near a label's turns,
 * suggest that person for the label that said it most.
 */
export function nameHintsFromText(
  utterances: TranscriptUtterance[],
  present: { id: string; name: string }[],
): Record<string, string | null> {
  const map: Record<string, string | null> = {};
  const counts = new Map<string, Map<string, number>>();
  for (const u of utterances) {
    const lower = u.text.toLowerCase();
    for (const p of present) {
      const first = p.name.split(/\s+/)[0]?.toLowerCase();
      if (!first || first.length < 3) continue;
      if (!lower.includes(first)) continue;
      if (!counts.has(u.speaker)) counts.set(u.speaker, new Map());
      const m = counts.get(u.speaker)!;
      m.set(p.id, (m.get(p.id) ?? 0) + 1);
    }
  }
  for (const [label, byPerson] of counts) {
    let best: string | null = null;
    let n = 0;
    for (const [id, c] of byPerson) {
      if (c > n) {
        n = c;
        best = id;
      }
    }
    if (best && n >= 1) map[label] = best;
  }
  return map;
}

/**
 * Fetch speaker identification from a completed AssemblyAI transcript job.
 * Returns label → personId using present name matching.
 */
export async function fetchAssemblyAiSpeakerNames(opts: {
  jobId: string;
  present: { id: string; name: string }[];
  utterances: TranscriptUtterance[];
}): Promise<Record<string, string | null>> {
  const fromText = nameHintsFromText(opts.utterances, opts.present);
  const key = assemblyAiKey();
  if (!key || opts.jobId.startsWith("stub-")) return fromText;

  try {
    const res = await fetch(
      `https://api.assemblyai.com/v2/transcript/${opts.jobId}`,
      { headers: { authorization: key } },
    );
    if (!res.ok) return fromText;
    const data = (await res.json()) as {
      speakers?: { speaker: string; label?: string; name?: string }[];
      speaker_labels?: { speaker: string; label?: string; name?: string }[];
    };
    const rows = data.speakers ?? data.speaker_labels ?? [];
    if (!rows.length) return fromText;

    const byLabel: Record<string, string | null> = { ...fromText };
    for (const row of rows) {
      const raw = (row.label ?? row.name ?? "").trim();
      if (!raw) continue;
      const hit = opts.present.find(
        (p) =>
          p.name.toLowerCase() === raw.toLowerCase() ||
          p.name.toLowerCase().startsWith(raw.toLowerCase()) ||
          raw.toLowerCase().startsWith(p.name.split(/\s+/)[0]!.toLowerCase()),
      );
      if (hit) byLabel[row.speaker] = hit.id;
    }
    return byLabel;
  } catch {
    return fromText;
  }
}
