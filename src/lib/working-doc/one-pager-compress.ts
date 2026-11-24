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
