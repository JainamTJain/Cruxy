/**
 * Map one-pager field edits back into the working document section they came from.
 */
import "server-only";

import type { OnePagerBody } from "@/lib/revision/types";
import type { WorkingSectionKey } from "@/lib/db/supabase/working-doc-extra";
import { listWorkingSections } from "@/lib/db/supabase/working-doc-extra";
import { ensureTeamBrief } from "@/lib/case-brain/team-brief";
import { saveWorkingSectionBody } from "@/lib/working-doc/service";
import { logActivity } from "@/lib/db/repository";

export type OnePagerFieldKey =
  | "thesis"
  | `claim_${number}_text`
  | `claim_${number}_logic`
  | `claim_${number}_support_${number}`
  | "counterclaim_text"
  | "counterclaim_concede"
  | "counterclaim_distinguish"
  | "counterclaim_rebut"
  | "values_left"
  | "values_right"
  | "values_note"
  | "question"
  | `question_${number}_q`
  | `question_${number}_a`;

function sectionBody(
  sections: { section_key: WorkingSectionKey; body: string }[],
  key: WorkingSectionKey,
): string {
  return sections.find((s) => s.section_key === key)?.body ?? "";
}

function replaceClaimBlock(
  claimsText: string,
  index: number,
  next: { text?: string; logic?: string },
): string {
  const blocks = claimsText.split(/\n(?=\s*Claim\s+\d+\s*:)/i);
  if (blocks.length > index) {
    const block = blocks[index]!;
    let updated = block;
    if (next.text !== undefined) {
      updated = updated.replace(
        /^(Claim\s+\d+\s*:\s*).+$/im,
        `$1${next.text}`,
      );
      if (!/^Claim\s+\d+\s*:/im.test(updated)) {
        updated = `Claim ${index + 1}: ${next.text}\n${updated}`;
      }
    }
    if (next.logic !== undefined) {
      if (/^Logic line\s*:/im.test(updated)) {
        updated = updated.replace(
          /^(Logic line\s*:\s*).+$/im,
          `$1${next.logic}`,
        );
      } else {
        updated = `${updated.trimEnd()}\nLogic line: ${next.logic}`;
      }
    }
    blocks[index] = updated;
    return blocks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  // Free-form: replace line index or append.
  const lines = claimsText
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (next.text !== undefined) {
    if (lines[index]) lines[index] = next.text;
    else lines.push(next.text);
  }
  if (next.logic !== undefined) {
    lines.push(`Logic line: ${next.logic}`);
  }
  return lines.join("\n");
}

function replaceSupport(
  supportText: string,
  claimIndex: number,
  supportIndex: number,
  next: string,
): string {
  const blocks = supportText.split(/\n(?=\s*Claim\s+\d+\s*:)/i);
  if (blocks.length > claimIndex) {
    const block = blocks[claimIndex]!;
    const lines = block.split(/\n/);
    let seen = -1;
    let replaced = false;
    const out = lines.map((line) => {
      if (/^S\d+\.?\s*/i.test(line.trim())) {
        seen += 1;
        if (seen === supportIndex) {
          replaced = true;
          return line.replace(/^(S\d+\.?\s*).+$/i, `$1${next}`);
        }
      }
      return line;
    });
    if (!replaced) {
      out.push(`S${supportIndex + 1}. ${next}`);
    }
    blocks[claimIndex] = out.join("\n");
    return blocks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  const lines = supportText
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const i = claimIndex * 3 + supportIndex;
  if (lines[i]) lines[i] = next;
  else lines.push(next);
  return lines.join("\n");
}

function replaceObjection(
  text: string,
  patch: {
    text?: string;
    concede?: string;
    distinguish?: string;
    rebut?: string;
  },
): string {
  let out = text.trim();
  if (!out) {
    return [
      patch.text ? `Objection 1: ${patch.text}` : "Objection 1:",
      patch.concede ? `Concede: ${patch.concede}` : null,
      patch.distinguish ? `Distinguish: ${patch.distinguish}` : null,
      patch.rebut ? `Rebut: ${patch.rebut}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (patch.text !== undefined) {
    if (/^Objection\s+\d+\s*:/im.test(out)) {
      out = out.replace(/^(Objection\s+\d+\s*:\s*).+$/im, `$1${patch.text}`);
    } else {
      const lines = out.split(/\n/);
      lines[0] = patch.text;
      out = lines.join("\n");
    }
  }
  const setLine = (label: string, value: string) => {
    const re = new RegExp(`^${label}\\s*:.*$`, "im");
    if (re.test(out)) out = out.replace(re, `${label}: ${value}`);
    else out = `${out.trimEnd()}\n${label}: ${value}`;
  };
  if (patch.concede !== undefined) setLine("Concede", patch.concede);
  if (patch.distinguish !== undefined) setLine("Distinguish", patch.distinguish);
  if (patch.rebut !== undefined) setLine("Rebut", patch.rebut);
  return out;
}

function replaceValues(
  text: string,
  patch: { left?: string; right?: string; note?: string },
): string {
  let left = text.match(/^Crux\s*:\s*(.+?)\s+versus\s+(.+)$/im)?.[1]?.trim();
  let right = text.match(/^Crux\s*:\s*(.+?)\s+versus\s+(.+)$/im)?.[2]?.trim();
  if (!left && !right) {
    const vs = text.match(/^Crux\s*:\s*(.+?)\s+vs\.?\s+(.+)$/im);
    left = vs?.[1]?.trim();
    right = vs?.[2]?.trim();
  }
  if (patch.left !== undefined) left = patch.left;
  if (patch.right !== undefined) right = patch.right;
  let out = text;
  const crux = `Crux: ${left || "Value A"} versus ${right || "Value B"}`;
  if (/^Crux\s*:/im.test(out)) {
    out = out.replace(/^Crux\s*:.*$/im, crux);
  } else {
    out = `${crux}\n${out}`.trim();
  }
  if (patch.note !== undefined) {
    if (/^The trap\s*:/im.test(out)) {
      out = out.replace(/^The trap\s*:.*$/im, `The trap: ${patch.note}`);
    } else {
      out = `${out.trimEnd()}\nThe trap: ${patch.note}`;
    }
  }
  return out;
}

function replaceQuestion(
  text: string,
  index: number,
  patch: { q?: string; a?: string },
): string {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  while (blocks.length <= index) blocks.push(`Q: \nA: `);
  let block = blocks[index]!;
  if (patch.q !== undefined) {
    if (/^Q\s*:/im.test(block)) {
      block = block.replace(/^Q\s*:.*$/im, `Q: ${patch.q}`);
    } else {
      block = `Q: ${patch.q}\n${block}`;
    }
  }
  if (patch.a !== undefined) {
    if (/^A\s*:/im.test(block)) {
      block = block.replace(/^A\s*:.*$/im, `A: ${patch.a}`);
    } else {
      block = `${block.trimEnd()}\nA: ${patch.a}`;
    }
  }
  blocks[index] = block;
  return blocks.join("\n\n");
}

/**
 * Apply a one-pager body (after an inline edit) back onto working document sections.
 */
export async function writeOnePagerBodyToWorkingDoc(opts: {
  caseId: string;
  teamId: string;
  personId: string;
  body: OnePagerBody;
  fieldKey?: string;
}): Promise<void> {
  const brief = await ensureTeamBrief({
    caseId: opts.caseId,
    teamId: opts.teamId,
    personId: opts.personId,
  });
  const sections = await listWorkingSections(brief.id);
  const updates: Partial<Record<WorkingSectionKey, string>> = {};

  const thesis =
    opts.body.language?.plain ||
    (
      opts.body.visuals.find((v) => v.kind === "claim_map")?.payload as {
        thesis?: string;
      }
    )?.thesis ||
    "";
  updates.answer_one_sentence = thesis;

  const claimLines = opts.body.claims.map((c, i) => {
    const bits = [
      `Claim ${i + 1}: ${c.text}`,
      c.logic_line ? `Logic line: ${c.logic_line}` : null,
    ].filter(Boolean);
    return bits.join("\n");
  });
  updates.claims = claimLines.join("\n\n");

  const supportLines = opts.body.claims.map((c, i) => {
    const supports = c.supports
      .filter(Boolean)
      .map((s, j) => `S${j + 1}. ${s}`);
    return [`Claim ${i + 1}: ${c.text}`, ...supports].join("\n");
  });
  updates.support = supportLines.join("\n\n");

  const cc = opts.body.counterclaim;
  if (cc) {
    updates.objection_reply = replaceObjection(
      sectionBody(sections, "objection_reply"),
      {
        text: cc.text,
        concede: cc.concede,
        distinguish: cc.distinguish,
        rebut: cc.rebut,
      },
    );
  }

  const values = opts.body.visuals.find((v) => v.kind === "values_scale")
    ?.payload as { left?: string; right?: string; note?: string } | undefined;
  if (values) {
    updates.values_in_tension = replaceValues(
      sectionBody(sections, "values_in_tension"),
      {
        left: values.left,
        right: values.right,
        note: values.note ?? undefined,
      },
    );
  }

  const questions = (
    opts.body.visuals.find((v) => v.kind === "question_table")?.payload as {
      rows?: { q: string; a?: string }[];
    }
  )?.rows;
  if (questions?.length) {
    updates.judges_questions = questions
      .map((r) => `Q: ${r.q}${r.a ? `\nA: ${r.a}` : ""}`)
      .join("\n\n");
  }

  for (const [key, body] of Object.entries(updates) as [
    WorkingSectionKey,
    string,
  ][]) {
    const prev = sectionBody(sections, key);
    if (prev.trim() === body.trim()) continue;
    await saveWorkingSectionBody({
      caseId: opts.caseId,
      teamId: opts.teamId,
      personId: opts.personId,
      sectionKey: key,
      body,
    });
  }

  await logActivity({
    person_id: opts.personId,
    action: "one_pager_wrote_working_doc",
    target: opts.caseId,
    meta: {
      teamId: opts.teamId,
      fieldKey: opts.fieldKey ?? null,
      sections: Object.keys(updates),
    },
  });
}

/** Helpers kept for targeted single-field patches (used by tests / callers). */
export const onePagerWritebackHelpers = {
  replaceClaimBlock,
  replaceSupport,
  replaceObjection,
  replaceValues,
  replaceQuestion,
};
