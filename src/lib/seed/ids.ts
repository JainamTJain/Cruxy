import { createHash } from "crypto";

/** Fixed IDs matching supabase/seed.sql so SQL and sample store stay aligned. */
export const SEED_TEAM_IDS = {
  team1: "11111111-1111-1111-1111-111111111111",
  team2: "22222222-2222-2222-2222-222222222222",
  team3: "33333333-3333-3333-3333-333333333333",
} as const;

export const SEED_PERSON_IDS = {
  Serena: "a1111111-1111-1111-1111-111111111101",
  Ivan: "a1111111-1111-1111-1111-111111111102",
  Ashton: "a1111111-1111-1111-1111-111111111103",
  Stolei: "a1111111-1111-1111-1111-111111111104",
  Tri: "a1111111-1111-1111-1111-111111111105",
  Lehar: "a2222222-2222-2222-2222-222222222201",
  Camerin: "a2222222-2222-2222-2222-222222222202",
  Jade: "a2222222-2222-2222-2222-222222222203",
  Bethany: "a2222222-2222-2222-2222-222222222204",
  Quixote: "a2222222-2222-2222-2222-222222222205",
  Nick: "a3333333-3333-3333-3333-333333333301",
  Daniel: "a3333333-3333-3333-3333-333333333302",
  Katie: "a3333333-3333-3333-3333-333333333303",
  Jainam: "a3333333-3333-3333-3333-333333333304",
  "Dr. B": "a0000000-0000-0000-0000-0000000000b0",
} as const;

/** Stable case UUIDs keyed by case number (1–15). */
export function caseId(number: number): string {
  const n = String(number).padStart(2, "0");
  return `c0000000-0000-4000-8000-0000000000${n}`;
}

/** Deterministic UUID from a stable seed key (idempotent re-runs). */
export function seedUuid(key: string): string {
  const h = createHash("sha256").update(`crux-seed-v1:${key}`).digest();
  const bytes = Buffer.from(h.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export const CONTENT_ORIGIN = "case prep doc" as const;
export const SEED_CREATED_AT = "2026-11-01T00:00:00.000Z";
