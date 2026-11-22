/**
 * Accuracy check: synthetic multi-speaker WAV → enroll → match.
 * Uses spectral fallback when the ECAPA ONNX model is not present.
 *
 * Run: NODE_OPTIONS='--require ./scripts/preload-server-only.cjs' npx tsx scripts/voiceprint-accuracy.ts
 */
import { encodeWav } from "../src/lib/voice/audio";
import { embedUtterance, cosineSimilarity } from "../src/lib/voice/embed";
import { assignSpeakersOneToOne } from "../src/lib/voice/match";
import { decodeWav, toPcm16k } from "../src/lib/voice/audio";

function tone(
  freq: number,
  seconds: number,
  sampleRate = 16000,
  noise = 0.02,
): Float32Array {
  const n = Math.floor(seconds * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    // Harmonic stack so spectral bands differ by F0.
    out[i] =
      0.45 * Math.sin(2 * Math.PI * freq * t) +
      0.25 * Math.sin(2 * Math.PI * freq * 2 * t) +
      0.15 * Math.sin(2 * Math.PI * freq * 3 * t) +
      (Math.random() * 2 - 1) * noise;
  }
  return out;
}

function mix(
  parts: { samples: Float32Array; startMs: number }[],
  totalMs: number,
): Float32Array {
  const n = Math.floor((totalMs / 1000) * 16000);
  const out = new Float32Array(n);
  for (const p of parts) {
    const start = Math.floor((p.startMs / 1000) * 16000);
    for (let i = 0; i < p.samples.length && start + i < n; i++) {
      out[start + i]! += p.samples[i]!;
    }
  }
  // Soft clip
  for (let i = 0; i < n; i++) {
    out[i] = Math.max(-1, Math.min(1, out[i]!));
  }
  return out;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok — ${msg}`);
}

async function main() {
  const speakers = [
    { id: "alice", f0: 180 },
    { id: "bob", f0: 110 },
    { id: "cara", f0: 240 },
  ];

  // Enroll each speaker with three short tones (read/natural/competition stand-ins).
  const enrolled: { personId: string; name: string; embedding: Float32Array }[] =
    [];
  for (const s of speakers) {
    const parts = [
      tone(s.f0, 2.0),
      tone(s.f0 * 1.01, 2.2),
      tone(s.f0 * 0.99, 1.8),
    ];
    const embeds = [];
    for (const p of parts) {
      const { embedding } = await embedUtterance({
        samples: p,
        sampleRate: 16000,
      });
      embeds.push(embedding);
    }
    // Mean
    const mean = new Float32Array(192);
    for (const e of embeds) {
      for (let i = 0; i < 192; i++) mean[i]! += e[i]!;
    }
    for (let i = 0; i < 192; i++) mean[i]! /= embeds.length;
    let n = 0;
    for (let i = 0; i < 192; i++) n += mean[i]! * mean[i]!;
    n = Math.sqrt(n) || 1;
    for (let i = 0; i < 192; i++) mean[i]! /= n;
    enrolled.push({ personId: s.id, name: s.id, embedding: mean });
  }

  // Same-speaker self similarity should beat cross-speaker.
  const self = cosineSimilarity(enrolled[0]!.embedding, enrolled[0]!.embedding);
  const cross = cosineSimilarity(enrolled[0]!.embedding, enrolled[1]!.embedding);
  assert(self > cross + 0.05, `self ${self.toFixed(3)} > cross ${cross.toFixed(3)}`);

  // Mix: A 0–3s, B 3–6s, C 6–9s
  const a = tone(speakers[0]!.f0, 2.8);
  const b = tone(speakers[1]!.f0, 2.8);
  const c = tone(speakers[2]!.f0, 2.8);
  const mixed = mix(
    [
      { samples: a, startMs: 0 },
      { samples: b, startMs: 3000 },
      { samples: c, startMs: 6000 },
    ],
    9000,
  );
  const wav = encodeWav(mixed, 16000);
  const decoded = toPcm16k(decodeWav(wav).samples, decodeWav(wav).sampleRate);

  const labels = [
    { label: "A", start: 0, end: 2800 },
    { label: "B", start: 3000, end: 5800 },
    { label: "C", start: 6000, end: 8800 },
  ];
  const labelEmbeds = [];
  for (const l of labels) {
    const start = Math.floor((l.start / 1000) * 16000);
    const end = Math.floor((l.end / 1000) * 16000);
    const slice = decoded.samples.subarray(start, end);
    const { embedding } = await embedUtterance({
      samples: slice,
      sampleRate: 16000,
    });
    labelEmbeds.push({ label: l.label, embedding });
  }

  const assign = assignSpeakersOneToOne(labelEmbeds, enrolled);
  const expected: Record<string, string> = {
    A: "alice",
    B: "bob",
    C: "cara",
  };
  let correct = 0;
  for (const a of assign) {
    if (a.personId === expected[a.label]) correct += 1;
    console.log(
      `  ${a.label} → ${a.personId} (score ${a.score.toFixed(3)}, expect ${expected[a.label]})`,
    );
  }
  assert(correct === 3, `matched all 3 speakers (${correct}/3)`);
  console.log("\nvoiceprint-accuracy: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
