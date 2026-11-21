import { createHash } from "crypto";
import { embedCruxy } from "@/lib/cruxy/callCruxy";
import { EMBEDDING_DIM } from "@/lib/library/types";

/** Deterministic stub embedding so search works without an AI key. */
export function stubEmbed(text: string, dim = EMBEDDING_DIM): number[] {
  const vec = new Array<number>(dim).fill(0);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  for (const token of tokens) {
    const h = createHash("sha256").update(token).digest();
    for (let i = 0; i < dim; i++) {
      const byte = h[i % h.length]!;
      vec[i]! += ((byte / 255) * 2 - 1) / Math.sqrt(tokens.length || 1);
    }
  }
  return normalize(vec);
}

export function normalize(vec: number[]): number[] {
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / mag);
}

export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

export function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

/**
 * Embed with the gateway embed tier. Falls back to stubEmbed when the
 * gateway is stubbed, refused, or returns an empty vector.
 */
export async function embedPassageText(
  text: string,
  opts?: { personId?: string | null; feature?: string },
): Promise<{ embedding: number[]; aiCalls: number; stub: boolean }> {
  const result = await embedCruxy({
    feature: opts?.feature ?? "passage_embed",
    value: text.slice(0, 6000),
    personId: opts?.personId ?? null,
  });
  if (!result.ok || result.stub || result.embedding.length === 0) {
    return {
      embedding: stubEmbed(text, EMBEDDING_DIM),
      aiCalls: result.ok ? 1 : 0,
      stub: true,
    };
  }
  // Pad or trim to the schema dim so pgvector stays consistent.
  let embedding = result.embedding;
  if (embedding.length < EMBEDDING_DIM) {
    embedding = embedding.concat(
      new Array(EMBEDDING_DIM - embedding.length).fill(0),
    );
  } else if (embedding.length > EMBEDDING_DIM) {
    embedding = embedding.slice(0, EMBEDDING_DIM);
  }
  return { embedding, aiCalls: 1, stub: false };
}
