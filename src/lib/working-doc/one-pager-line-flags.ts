/**
 * Line-level critique flags for the one pager, using the existing vocabulary
 * in src/lib/critique (rules + format). Does not call the critique engine.
 */
import "server-only";

import { KIND_LABELS } from "@/lib/critique/format";
import { ruleFindings, type SectionBodies } from "@/lib/critique/rules";
import type { CritiqueFinding, CritiqueKind } from "@/lib/critique/types";
import type { WorkingSectionKey } from "@/lib/db/supabase/working-doc-extra";
import { WORKING_SECTION_KEYS } from "@/lib/db/supabase/working-doc-extra";

export type OnePagerLineFlag = {
  fieldKey: string;
  kind: CritiqueKind;
  label: string;
  detail: string;
  fallacyName: string | null;
};

function emptySections(): SectionBodies {
  return Object.fromEntries(WORKING_SECTION_KEYS.map((k) => [k, ""])) as SectionBodies;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").replace(/["""']/g, "").trim();
}

function quoteFromWeakSpot(weak: string): string {
  const m = weak.match(/"([^"]+)"/);
  return m?.[1] ?? weak;
}

function fieldKeysForFinding(
  f: CritiqueFinding,
  bodyHints: {
    thesis: string;
    claims: { text: string; logic_line: string; supports: string[] }[];
    counterclaim: string;
  },
): string[] {
  const keys: string[] = [];
  const q = normalize(quoteFromWeakSpot(f.weakSpot));
  if (!q) return keys;

  if (f.sectionKey === "answer_one_sentence") {
    if (normalize(bodyHints.thesis).includes(q.slice(0, 40)) || q.includes(normalize(bodyHints.thesis).slice(0, 40))) {
      keys.push("thesis");
    } else {
      keys.push("thesis");
    }
    return keys;
  }

  bodyHints.claims.forEach((c, i) => {
    if (normalize(c.text).includes(q.slice(0, 36)) || q.includes(normalize(c.text).slice(0, 36))) {
      keys.push(`claim_${i}_text`);
    }
    if (c.logic_line && (normalize(c.logic_line).includes(q.slice(0, 36)) || q.includes(normalize(c.logic_line).slice(0, 36)))) {
      keys.push(`claim_${i}_logic`);
    }
    c.supports.forEach((s, j) => {
      if (s && (normalize(s).includes(q.slice(0, 36)) || q.includes(normalize(s).slice(0, 36)))) {
        keys.push(`claim_${i}_support_${j}`);
      }
    });
  });

  if (f.sectionKey === "objection_reply") {
    keys.push("counterclaim_text");
  }
  if (f.sectionKey === "values_in_tension") {
    keys.push("values_note");
  }
  if (f.kind === "missing_link" && !keys.length) {
    keys.push("claim_0_logic");
  }
  if (f.kind === "logical_fallacy" && !keys.length) {
    keys.push(f.sectionKey === "support" ? "claim_0_support_0" : "claim_0_text");
  }
  return [...new Set(keys)];
}

/** Build flags for one-pager fields from working-document section text. */
export function flagsForOnePager(opts: {
  sections: { section_key: WorkingSectionKey; body: string }[];
  thesis: string;
  claims: { text: string; logic_line: string; supports: string[] }[];
  counterclaimText: string;
}): OnePagerLineFlag[] {
  const bodies = emptySections();
  for (const s of opts.sections) {
    bodies[s.section_key] = s.body ?? "";
  }
  const findings = ruleFindings({ sections: bodies, truth: [] }).filter(
    (f) => f.kind === "logical_fallacy" || f.kind === "missing_link",
  );
  const out: OnePagerLineFlag[] = [];
  const seen = new Set<string>();
  for (const f of findings) {
    const fieldKeys = fieldKeysForFinding(f, {
      thesis: opts.thesis,
      claims: opts.claims,
      counterclaim: opts.counterclaimText,
    });
    for (const fieldKey of fieldKeys) {
      const id = `${fieldKey}:${f.kind}:${f.fallacyName ?? ""}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        fieldKey,
        kind: f.kind,
        label: f.fallacyName || KIND_LABELS[f.kind],
        detail: [f.why, f.stronger].filter(Boolean).join(" "),
        fallacyName: f.fallacyName,
      });
    }
  }
  return out.slice(0, 12);
}
