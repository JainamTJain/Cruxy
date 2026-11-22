import { cosineSimilarity } from "@/lib/voice/embed";
import type { SpeakerMapping, SpeakerMatchSource } from "@/lib/voice/types";

/** Cosine threshold for auto-accept (voiceprint). Below → Who is this? */
export const AUTO_MATCH_THRESHOLD = 0.55;
/** Below this, do not even suggest as a top candidate. */
export const CANDIDATE_THRESHOLD = 0.35;

export type PersonVoice = {
  personId: string;
  name: string;
  embedding: Float32Array;
};

export type LabelEmbed = {
  label: string;
  embedding: Float32Array;
};

/**
 * Hungarian algorithm (min cost) on an n×n cost matrix.
 * Cost = 1 - cosine, so higher similarity → lower cost.
 */
export function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  if (n === 0) return [];
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0);
  const way = new Array(n + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Infinity);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0] as number;
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1]![j - 1]! - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0] as number;
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  const assignment = new Array(n).fill(-1);
  for (let j = 1; j <= n; j++) {
    if (p[j] !== 0) assignment[(p[j] as number) - 1] = j - 1;
  }
  return assignment;
}

export function assignSpeakersOneToOne(
  labels: LabelEmbed[],
  people: PersonVoice[],
): { label: string; personId: string | null; score: number }[] {
  if (labels.length === 0) return [];
  if (people.length === 0) {
    return labels.map((l) => ({ label: l.label, personId: null, score: 0 }));
  }

  const n = Math.max(labels.length, people.length);
  const cost: number[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => 1),
  );
  for (let i = 0; i < labels.length; i++) {
    for (let j = 0; j < people.length; j++) {
      const sim = cosineSimilarity(labels[i]!.embedding, people[j]!.embedding);
      cost[i]![j] = 1 - sim;
    }
  }

  const assignment = hungarian(cost);
  const usedPeople = new Set<number>();
  const out: { label: string; personId: string | null; score: number }[] = [];

  for (let i = 0; i < labels.length; i++) {
    const j = assignment[i] ?? -1;
    if (j < 0 || j >= people.length || usedPeople.has(j)) {
      out.push({ label: labels[i]!.label, personId: null, score: 0 });
      continue;
    }
    const score = 1 - (cost[i]![j] ?? 1);
    usedPeople.add(j);
    out.push({
      label: labels[i]!.label,
      personId: score >= CANDIDATE_THRESHOLD ? people[j]!.personId : null,
      score,
    });
  }
  return out;
}

export function mergeNameSignal(
  voiceMaps: { label: string; personId: string | null; score: number }[],
  nameByLabel: Record<string, string | null>,
  peopleById: Map<string, string>,
): SpeakerMapping[] {
  const taken = new Set<string>();
  const mappings: SpeakerMapping[] = [];

  for (const v of voiceMaps) {
    const nameId = nameByLabel[v.label] ?? null;
    let person_id = v.personId;
    let confidence = v.score;
    let source: SpeakerMatchSource = "voiceprint";

    if (nameId && (!person_id || nameId === person_id)) {
      person_id = nameId;
      confidence = Math.max(confidence, 0.62);
      source = v.personId && v.personId === nameId ? "voiceprint" : "name";
      if (v.personId && v.personId === nameId) {
        confidence = Math.min(0.99, v.score + 0.15);
        source = "voiceprint";
      }
    } else if (nameId && person_id && nameId !== person_id) {
      // Conflict: prefer higher voice score; else name.
      if (v.score < AUTO_MATCH_THRESHOLD) {
        person_id = nameId;
        confidence = 0.5;
        source = "name";
      }
    }

    if (person_id && taken.has(person_id)) {
      person_id = null;
      confidence = 0;
    }
    if (person_id) taken.add(person_id);

    mappings.push({
      speaker_label: v.label,
      person_id,
      confidence,
      source: person_id ? source : undefined,
    });
    void peopleById;
  }
  return mappings;
}

export function needsWhoIsThis(m: SpeakerMapping): boolean {
  if (!m.person_id) return true;
  return (m.confidence ?? 0) < AUTO_MATCH_THRESHOLD;
}
