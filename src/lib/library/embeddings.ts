import { createHash } from "crypto";
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
