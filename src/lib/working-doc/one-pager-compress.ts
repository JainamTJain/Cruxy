/**
 * Compress long working-document sections into tight one-pager lines.
 * Deterministic clip is the default; Cruxy tier small only when a section is long.
 * Results are cached by a hash of the section text.
 */
import "server-only";

import { createHash } from "crypto";
import { callCruxy } from "@/lib/cruxy/callCruxy";
import {
  getCompressedSection,
  putCompressedSection,
} from "@/lib/db/supabase/one-pager-compress-extra";
import type { WorkingSectionKey } from "@/lib/db/supabase/working-doc-extra";
import type { OnePagerBody } from "@/lib/revision/types";

const LONG = 520;

export function sectionHash(sectionKey: WorkingSectionKey, body: string): string {
  return createHash("sha256")
    .update(`${sectionKey}\n${body}`)
    .digest("hex")
    .slice(0, 40);
}

export function sectionsContentHash(
  sections: { section_key: WorkingSectionKey; body: string }[],
): string {
  const joined = [...sections]
    .sort((a, b) => a.section_key.localeCompare(b.section_key))
    .map((s) => `${s.section_key}:${s.body}`)
    .join("\n---\n");
  return createHash("sha256").update(joined).digest("hex").slice(0, 40);
}

/** Cut at a sentence or word boundary. */
function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  if (stop > max * 0.5) return cut.slice(0, stop + 1).trim();
  const space = cut.lastIndexOf(" ");
  return (
    cut.slice(0, space > 40 ? space : max).replace(/[,;:(]+$/, "").trim() + "..."
  );
}

/**
 * Return section bodies suitable for the one pager. Long ones are compressed
 * (cached by hash). Short ones pass through. Never invents content.
 */
export async function compressSectionsForOnePager(opts: {
  sections: { section_key: WorkingSectionKey; body: string }[];
  personId: string | null;
  caseId: string;
  teamId: string;
}): Promise<{ section_key: WorkingSectionKey; body: string }[]> {
  const out: { section_key: WorkingSectionKey; body: string }[] = [];
  for (const s of opts.sections) {
    const body = s.body.trim();
    if (!body || body.length <= LONG) {
      out.push({ section_key: s.section_key, body: s.body });
      continue;
    }
    const hash = sectionHash(s.section_key, body);
    const cached = await getCompressedSection(hash);
    if (cached) {
      out.push({ section_key: s.section_key, body: cached });
      continue;
    }
    // Deterministic clip is the safe default. Only keep a Cruxy rewrite when
    // the gateway actually ran (never a stub placeholder).
    let compressed = clip(body, LONG);
    if (opts.personId) {
      const result = await callCruxy({
        feature: "one_pager_compress",
        tier: "small",
        personId: opts.personId,
        estimatedCostUsd: 0.002,
        messages: [
          {
            role: "system",
            content:
              "You tighten Ethics Bowl one-pager lines. Keep every claim, name and number. No new ideas. Plain words. No em dashes. Reply with only the tightened text.",
          },
          {
            role: "user",
            content: `Tighten this ${s.section_key.replace(/_/g, " ")} section to fit a one pager (about ${Math.min(LONG, 400)} characters). Keep structure labels like "Claim 1:" and "Logic line:".\n\n${body.slice(0, 4000)}`,
          },
        ],
      });
      const text = result.ok ? result.text.trim() : "";
      const isStub =
        (result.ok && "stub" in result && result.stub) ||
        /\[cruxy stub\]/i.test(text) ||
        /gateway key not configured/i.test(text);
      if (text && !isStub && text.length >= 40) {
        compressed = clip(text.replace(/[—–·]/g, ",").trim(), LONG + 80);
      }
    }
    await putCompressedSection({
      hash,
      sectionKey: s.section_key,
      source: body,
      compressed,
      caseId: opts.caseId,
      teamId: opts.teamId,
    });
    out.push({ section_key: s.section_key, body: compressed });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Field-level tightening, after the working document has been parsed. */


const FIELD_MAX = {
  claim: 200,
  logic: 280,
  support: 260,
  counter: 240,
  reply: 240,
} as const;

function words(t: string): Set<string> {
  return new Set(t.toLowerCase().match(/[a-z']{4,}/g) ?? []);
}

/** True when two lines say nearly the same thing (word overlap). */
export function nearDuplicate(a: string, b: string): boolean {
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return false;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.min(wa.size, wb.size) >= 0.6;
}

type Slot = { get: () => string; set: (v: string) => void; max: number };

/**
 * Tighten each long field of a parsed one pager. One Cruxy call (tier small)
 * covers every uncached long field; each result is cached by the field's own
 * text, so unchanged lines never cost again. Falls back to a clean sentence
 * cut. Also drops near duplicate supports.
 */
export async function tightenOnePagerBody(opts: {
  body: OnePagerBody;
  personId: string | null;
  caseId: string;
  teamId: string;
}): Promise<OnePagerBody> {
  const body: OnePagerBody = JSON.parse(JSON.stringify(opts.body));

  for (const c of body.claims) {
    const kept: string[] = [];
    for (const s of c.supports) {
      if (!s.trim()) continue;
      if (kept.some((k) => nearDuplicate(k, s))) continue;
      if (c.logic_line && nearDuplicate(c.logic_line, s) && s.length < c.logic_line.length + 40) continue;
      kept.push(s);
    }
    while (kept.length < 3) kept.push("");
    c.supports = kept.slice(0, 3);
  }

  const slots: Slot[] = [];
  for (const c of body.claims) {
    slots.push({ get: () => c.text, set: (v) => (c.text = v), max: FIELD_MAX.claim });
    slots.push({ get: () => c.logic_line, set: (v) => (c.logic_line = v), max: FIELD_MAX.logic });
    c.supports.forEach((_, j) =>
      slots.push({ get: () => c.supports[j]!, set: (v) => (c.supports[j] = v), max: FIELD_MAX.support }),
    );
  }
  const k = body.counterclaim;
  if (k) {
    slots.push({ get: () => k.text, set: (v) => (k.text = v), max: FIELD_MAX.counter });
    for (const key of ["concede", "distinguish", "rebut"] as const) {
      slots.push({ get: () => k[key], set: (v) => (k[key] = v), max: FIELD_MAX.reply });
    }
  }

  const long = slots.filter((s) => s.get().trim().length > s.max);
  const pending: { slot: Slot; hash: string; text: string }[] = [];
  for (const slot of long) {
    const text = slot.get().replace(/\s+/g, " ").trim();
    const hash = sectionHash("claims", `field:${slot.max}:${text}`);
    const cached = await getCompressedSection(hash);
    if (cached) slot.set(cached);
    else pending.push({ slot, hash, text });
  }
  if (!pending.length) return body;

  let rewrites: string[] = [];
  if (opts.personId) {
    const result = await callCruxy({
      feature: "one_pager_compress",
      tier: "small",
      personId: opts.personId,
      estimatedCostUsd: 0.003,
      messages: [
        {
          role: "system",
          content:
            "You tighten lines for an Ethics Bowl one pager that a student glances at mid round. For each numbered line, keep its claim, reasoning step, names and numbers, cut filler, and stay under the character limit given. Never add an idea that is not in the line. Plain words. No em dashes. Reply with only a JSON array of strings, one per line, in order.",
        },
        {
          role: "user",
          content: pending
            .map((p, i) => `${i + 1}. (limit ${p.slot.max} characters) ${p.text.slice(0, 1500)}`)
            .join("\n\n"),
        },
      ],
    });
    const raw = result.ok ? result.text.trim() : "";
    const isStub =
      (result.ok && "stub" in result && result.stub) ||
      /\[cruxy stub\]|gateway key not configured/i.test(raw);
    if (!isStub) {
      try {
        const json = raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1);
        const arr = JSON.parse(json) as unknown;
        if (Array.isArray(arr) && arr.length === pending.length) {
          rewrites = arr.map((x) => (typeof x === "string" ? x : ""));
        }
      } catch {
        rewrites = [];
      }
    }
  }

  for (let i = 0; i < pending.length; i++) {
    const p = pending[i]!;
    const r = (rewrites[i] ?? "").replace(/[—–·]/g, ",").replace(/\s+/g, " ").trim();
    const good = r.length >= 30 && r.length <= p.slot.max + 60;
    const out = good ? r : clip(p.text, p.slot.max);
    p.slot.set(out);
    if (good) {
      await putCompressedSection({
        hash: p.hash,
        sectionKey: "claims",
        source: p.text,
        compressed: out,
        caseId: opts.caseId,
        teamId: opts.teamId,
      });
    }
  }
  return body;
}
