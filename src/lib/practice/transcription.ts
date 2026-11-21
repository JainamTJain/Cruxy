import { randomUUID } from "crypto";
import type { GlossaryTerm, TranscriptLine } from "@/lib/practice/types";
import { applyGlossaryCorrections } from "@/lib/practice/glossary";
import { nowIso } from "@/lib/utils";

export type TranscriptUtterance = {
  start_ms: number;
  end_ms: number;
  speaker: string;
  text: string;
};

export type TranscribeResult = {
  jobId: string;
  utterances: TranscriptUtterance[];
  stub: boolean;
};

function assemblyAiKey(): string | null {
  const k = process.env.ASSEMBLYAI_API_KEY?.trim();
  return k || null;
}

/**
 * Transcribe audio with speaker labels via AssemblyAI.
 * When the key is missing, returns a deterministic stub transcript (sample-data path).
 * Never logs the API key.
 */
export async function transcribeWithSpeakerLabels(opts: {
  audio: Buffer;
  keyTerms: string[];
  roundId: string;
}): Promise<TranscribeResult> {
  const key = assemblyAiKey();
  if (!key) {
    return stubTranscript(opts.roundId, opts.keyTerms);
  }

  try {
    const body = new Uint8Array(opts.audio);
    const uploadRes = await fetch("https://api.assemblyai.com/v2/upload", {
      method: "POST",
      headers: {
        authorization: key,
        "content-type": "application/octet-stream",
      },
      body,
    });
    if (!uploadRes.ok) {
      // Fall back to stub rather than failing the whole practice loop in sample mode.
      return stubTranscript(opts.roundId, opts.keyTerms);
    }
    const uploadJson = (await uploadRes.json()) as { upload_url: string };

    const createRes = await fetch("https://api.assemblyai.com/v2/transcript", {
      method: "POST",
      headers: {
        authorization: key,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        audio_url: uploadJson.upload_url,
        speaker_labels: true,
        word_boost: opts.keyTerms.slice(0, 100),
        boost_param: "high",
      }),
    });
    if (!createRes.ok) {
      return stubTranscript(opts.roundId, opts.keyTerms);
    }
    const created = (await createRes.json()) as { id: string };
    const transcript = await pollTranscript(key, created.id);
    // Tiny / non-audio blobs (e.g. chunk checks) can complete with zero utterances.
    if (!transcript.length) {
      return stubTranscript(opts.roundId, opts.keyTerms);
    }
    return {
      jobId: created.id,
      utterances: transcript,
      stub: false,
    };
  } catch {
    return stubTranscript(opts.roundId, opts.keyTerms);
  }
}

async function pollTranscript(
  key: string,
  id: string,
  attempts = 40,
): Promise<TranscriptUtterance[]> {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
      headers: { authorization: key },
    });
    if (!res.ok) break;
    const data = (await res.json()) as {
      status: string;
      utterances?: {
        start: number;
        end: number;
        speaker: string;
        text: string;
      }[];
      words?: { start: number; end: number; text: string; speaker?: string }[];
    };
    if (data.status === "completed") {
      if (data.utterances?.length) {
        return data.utterances.map((u) => ({
          start_ms: u.start,
          end_ms: u.end,
          speaker: u.speaker,
          text: u.text,
        }));
      }
      // Fallback: group words by speaker
      const words = data.words ?? [];
      const out: TranscriptUtterance[] = [];
      let cur: TranscriptUtterance | null = null;
      for (const w of words) {
        const sp = w.speaker ?? "A";
        if (!cur || cur.speaker !== sp) {
          if (cur) out.push(cur);
          cur = {
            start_ms: w.start,
            end_ms: w.end,
            speaker: sp,
            text: w.text,
          };
        } else {
          cur.end_ms = w.end;
          cur.text += ` ${w.text}`;
        }
      }
      if (cur) out.push(cur);
      return out;
    }
    if (data.status === "error") break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return [];
}

function stubTranscript(
  roundId: string,
  keyTerms: string[],
): TranscribeResult {
  const term = keyTerms[0] ?? "claim";
  return {
    jobId: `stub-${roundId}-${randomUUID().slice(0, 8)}`,
    stub: true,
    utterances: [
      {
        start_ms: 0,
        end_ms: 4200,
        speaker: "A",
        text: `Our thesis is that the central moral question turns on respect for stakeholders, especially around ${term}.`,
      },
      {
        start_ms: 4300,
        end_ms: 9100,
        speaker: "B",
        text: "We concede the practical concern, but distinguish it from the principle at stake in this case.",
      },
      {
        start_ms: 9200,
        end_ms: 14000,
        speaker: "A",
        text: "In response to the judges: the least restrictive tool still fails the fairness test.",
      },
    ],
  };
}

export function utterancesToLines(
  roundId: string,
  utterances: TranscriptUtterance[],
  glossary: GlossaryTerm[],
  speakerMap: Record<string, string | null>,
): TranscriptLine[] {
  const at = nowIso();
  return utterances.map((u) => {
    const { text, corrections } = applyGlossaryCorrections(u.text, glossary);
    return {
      id: randomUUID(),
      round_id: roundId,
      start_ms: u.start_ms,
      end_ms: u.end_ms,
      speaker_person_id: speakerMap[u.speaker] ?? null,
      speaker_label: u.speaker,
      text,
      corrected: corrections.length > 0,
      created_at: at,
    };
  });
}

export function matchSpeakersByRole(
  utterances: TranscriptUtterance[],
  presentPersonIds: string[],
): Record<string, string | null> {
  const labels = [...new Set(utterances.map((u) => u.speaker))];
  const map: Record<string, string | null> = {};
  labels.forEach((label, i) => {
    map[label] = presentPersonIds[i] ?? null;
  });
  return map;
}
