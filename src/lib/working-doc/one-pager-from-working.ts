/**
 * Draw a one-pager body from the team's working document + accepted suggestions.
 */
import "server-only";

import { ensureTeamBrief } from "@/lib/case-brain/team-brief";
import {
  listAllSuggestions,
  listWorkingSections,
  type WorkingSectionKey,
} from "@/lib/db/supabase/working-doc-extra";
import {
  insertOnePagerSyncProposal,
  getPendingOnePagerSync,
  decideOnePagerSync,
} from "@/lib/db/supabase/one-pager-sync-extra";
import { withEmptyRows } from "@/lib/revision/one-pager-edit";
import type { OnePagerBody } from "@/lib/revision/types";
import {
  latestOnePager,
  saveOnePagerEdit,
  draftOnePager,
} from "@/lib/revision/repository";
import { logActivity } from "@/lib/db/repository";

function sectionBody(
  sections: { section_key: WorkingSectionKey; body: string }[],
  key: WorkingSectionKey,
): string {
  return sections.find((s) => s.section_key === key)?.body.trim() ?? "";
}

function splitClaims(claimsText: string): string[] {
  const lines = claimsText
    .split(/\n+/)
    .map((l) => l.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter(Boolean);
  if (lines.length >= 2) return lines.slice(0, 2);
  if (claimsText.trim()) {
    const parts = claimsText.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) return parts.slice(0, 2);
    return [claimsText.trim(), ""];
  }
  return ["", ""];
}

function splitSupports(supportText: string): string[] {
  const lines = supportText
    .split(/\n+/)
    .map((l) => l.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter(Boolean);
  const out = lines.slice(0, 3);
  while (out.length < 3) out.push("");
  return out;
}

type ParsedClaim = { text: string; logic: string; supports: string[] };

/** Blocks that start with a label line such as "Claim 1:" or "Objection 2:". */
function blocks(text: string, label: RegExp): string[][] {
  const out: string[][] = [];
  let cur: string[] | null = null;
  for (const raw of text.split(/\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (label.test(line)) {
      cur = [line];
      out.push(cur);
    } else if (cur) {
      cur.push(line);
    }
  }
  return out;
}

/** Cut at a sentence or word boundary, never mid-word. */
function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  if (stop > max * 0.5) return cut.slice(0, stop + 1).trim();
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:(]+$/, "").trim() + "...";
}

const cap = (t: string) => t.replace(/^[a-z]/, (c) => c.toUpperCase());
const FRAMEWORK_NAMES: Record<string, string> = {
  utilitarian: "Utilitarianism",
  consequentialis: "Consequentialism",
  virtue: "Virtue ethics",
  rights: "Rights",
  "care ethics": "Care ethics",
  "social contract": "Social contract",
};

/** "(3): that's why..." becomes "On their point that X: that's why...". */
function expandRef(reply: string, theirs: string): string {
  const m = reply.match(/^\((\d)\)\s*:?\s*/);
  if (!m) return cap(reply);
  const items = theirs.split(/\(\d\)\s*/).map((x) => x.replace(/[;.]\s*$/, "").trim()).filter(Boolean);
  const point = items[Number(m[1]) - 1];
  const rest = reply.slice(m[0].length);
  return cap(point ? `On "${clip(point, 90)}": ${rest}` : rest);
}

function after(label: RegExp, lines: string[]): string {
  const hit = lines.find((l) => label.test(l));
  return hit ? hit.replace(label, "").trim() : "";
}

/**
 * Read the working document's structure: "Claim N:" blocks with a logic line,
 * "S1." supports with backing, "Objection N:" with concede, distinguish and
 * rebut, "Crux: A versus B", stakeholders, and "Q:"/"A:" pairs. Free-form
 * writing falls back to line-by-line reading.
 */
export function bodyFromWorkingSections(opts: {
  sections: { section_key: WorkingSectionKey; body: string }[];
  acceptedTexts: string[];
  thesisFallback?: string | null;
}): OnePagerBody {
  const answer = sectionBody(opts.sections, "answer_one_sentence");
  const claimsRaw = sectionBody(opts.sections, "claims");
  const supportRaw = sectionBody(opts.sections, "support");
  const objection = sectionBody(opts.sections, "objection_reply");
  const values = sectionBody(opts.sections, "values_in_tension");
  const judges = sectionBody(opts.sections, "judges_questions");

  // Claims and logic lines.
  const claimBlocks = blocks(claimsRaw, /^claim \d+\s*:/i);
  let parsed: ParsedClaim[] = claimBlocks.map((b) => ({
    text: b[0]!.replace(/^claim \d+\s*:\s*/i, "").trim(),
    logic: after(/^logic line\s*:\s*/i, b),
    supports: [],
  }));
  if (!parsed.length) {
    parsed = splitClaims(claimsRaw)
      .filter(Boolean)
      .map((t) => ({ text: t, logic: "", supports: [] }));
  }

  // Supports, grouped under their claim, with backing kept short.
  const supportBlocks = blocks(supportRaw, /^claim \d+\s*:/i);
  if (supportBlocks.length) {
    supportBlocks.forEach((b, i) => {
      const target = parsed[i] ?? (parsed[i] = { text: b[0]!.replace(/^claim \d+\s*:\s*/i, ""), logic: "", supports: [] });
      for (let j = 1; j < b.length; j++) {
        const line = b[j]!;
        if (/^s\d+\.?\s*/i.test(line)) {
          const backing = /^backing\s*:/i.test(b[j + 1] ?? "")
            ? ` Backing: ${clip(b[j + 1]!.replace(/^backing\s*:\s*/i, ""), 150)}`
            : "";
          target.supports.push(clip(`${line.replace(/^s\d+\.?\s*/i, "")}${backing}`, 360));
        }
      }
    });
  } else if (parsed[0]) {
    parsed[0].supports = splitSupports(supportRaw).filter(Boolean);
  }

  // Accepted suggestions fill support gaps with their stronger version.
  for (const t of opts.acceptedTexts) {
    const host = parsed.find((c) => c.supports.length < 3) ?? null;
    if (!host || !t.trim()) break;
    host.supports.push(clip(t, 280));
  }

  const claims = [0, 1].map((i) => {
    const c = parsed[i] ?? { text: i === 0 ? answer : "", logic: "", supports: [] };
    const sup = c.supports.slice(0, 3);
    while (sup.length < 3) sup.push("");
    return { text: c.text, logic_line: c.logic, supports: sup };
  });

  // First objection, with concede, distinguish and rebut.
  const objBlocks = blocks(objection, /^objection \d+\s*:/i);
  const ob = objBlocks[0];
  const theirs = ob ? after(/^their supports?\s*:\s*/i, ob) : "";
  const counterclaim = ob
    ? {
        text: ob[0]!.replace(/^objection \d+\s*:\s*/i, ""),
        concede: expandRef(after(/^concede\s*:\s*/i, ob), theirs),
        distinguish: expandRef(after(/^distinguish\s*:\s*/i, ob), theirs),
        rebut: expandRef(after(/^rebut\s*:\s*/i, ob), theirs),
      }
    : {
        text: objection.split(/\n/)[0]?.trim() ?? "",
        concede: "",
        distinguish: "",
        rebut: objection.includes("\n") ? objection.split(/\n/).slice(1).join(" ").trim() : "",
      };

  // Values: "Crux: A versus B".
  const cruxLine = (values.match(/^crux\s*:\s*(.+)$/im)?.[1] ?? values.split(/\n/)[0] ?? "").trim();
  const [left, right] = /\s+versus\s+/i.test(cruxLine)
    ? cruxLine.split(/\s+versus\s+/i)
    : /\s+vs\.?\s+/i.test(cruxLine)
      ? cruxLine.split(/\s+vs\.?\s+/i)
      : ["", cruxLine];
  const trap = cap((values.match(/^the trap\s*:\s*(.+)$/im)?.[1] ?? "").trim());

  // Stakeholders: "who: stake" lines after "Stakeholders:".
  const stakeStart = values.search(/^stakeholders\s*:/im);
  const stakeholders =
    stakeStart >= 0
      ? values
          .slice(stakeStart)
          .split(/\n/)
          .slice(1)
          .map((l) => l.trim())
          .filter((l) => l.includes(":"))
          .map((l) => {
            const i = l.indexOf(":");
            const rest = l.slice(i + 1);
            const voice = rest.match(/\(voice in the case:\s*([^)]+)\)/i)?.[1]?.trim() ?? "";
            return {
              who: l.slice(0, i).replace(/^[-*\d.)\s]+/, "").trim(),
              stake: clip(rest.replace(/\(voice in the case:[^)]*\)/i, ""), 140),
              voice: clip(voice, 60),
            };
          })
          .filter((c) => c.who.length > 1 && c.who.length < 60)
          .slice(0, 6)
      : [];

  // Questions: "Q:" with the following "A:" as the hint.
  const qa: { q: string; a: string }[] = [];
  const lines = judges.split(/\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (/^q\s*:/i.test(l) || (l.endsWith("?") && !/^a\s*:/i.test(l))) {
      const next = lines[i + 1] ?? "";
      qa.push({
        q: l.replace(/^q\s*:\s*/i, ""),
        a: /^a\s*:/i.test(next) ? clip(next.replace(/^a\s*:\s*/i, ""), 220) : "",
      });
    }
    if (qa.length >= 4) break;
  }

  // Frameworks named in the claims' ethical analysis.
  const FRAMEWORKS = ["Kant", "utilitarian", "consequentialis", "virtue", "Rawls", "care ethics", "social contract", "rights", "Mill", "Aristotle"];
  const claimSentences = claimsRaw
    .split(/\n+|(?<=[.!?])\s+/)
    .map((x) => x.replace(/^ethical analysis\s*:\s*/i, "").trim())
    .filter(Boolean);
  const frameworks = FRAMEWORKS.filter((f) => new RegExp(f, "i").test(claimsRaw))
    .slice(0, 4)
    .map((f) => {
      const line = claimSentences.find((x) => new RegExp(f, "i").test(x)) ?? f;
      const named = line.match(/([A-Z][a-z]+'s [a-z ]+?(?:formula|principle|theory|veil|test))/);
      const name = named?.[1] ?? FRAMEWORK_NAMES[f] ?? cap(f);
      // "Kant: do not treat..." under the name "Kant" would read "Kant: Kant:".
      const oneLine = line.replace(new RegExp(`^${f}\\w*\\s*:\\s*`, "i"), "");
      return { name, one_line: cap(clip(oneLine, 200)) };
    });

  const body: OnePagerBody = {
    claims,
    counterclaim,
    language: {
      plain: clip(answer || claims[0]!.text || "", 320),
      analogies: [],
      vivid: clip(trap, 240),
      avoid: [],
    },
    empty_rows: [],
    visuals: [
      {
        kind: "claim_map",
        title: "Claim map",
        payload: {
          nodes: claims.map((c, i) => ({
            id: `c${i + 1}`,
            label: c.text || `Claim ${i + 1}`,
            supports: c.supports.filter(Boolean),
          })),
          counter: clip(counterclaim.text, 240) || null,
        },
      },
      {
        kind: "values_scale",
        title: "Values in tension",
        payload: {
          left: clip(left || "", 160),
          right: clip(right || "", 160),
          note: clip(trap || cruxLine, 240),
        },
      },
      {
        kind: "question_table",
        title: "Likely questions",
        payload: { rows: qa },
      },
      {
        kind: "stakeholder_grid",
        title: "Stakeholders",
        payload: {
          cells: stakeholders.length
            ? stakeholders
            : ["Primary actors", "Affected", "Voiceless", "Institutions"],
        },
      },
      {
        kind: "fact_timeline",
        title: "Case facts",
        payload: { events: [] },
      },
      {
        kind: "framework_strip",
        title: "Frameworks",
        payload: { items: frameworks },
      },
    ],
  };

  const thesis = answer || opts.thesisFallback || "";
  if (thesis && body.language) {
    body.language.plain = clip(thesis, 320);
  }

  return withEmptyRows(body);
}

/** Change note on versions written by the sync, so we know nobody hand-edited them. */
export const SYNC_NOTE = "Updated from the working document";

/** True when a person typed a change note (not an auto sync / seed / import). */
export function handEditedNote(note: string | null | undefined): boolean {
  if (!note) return false;
  return !/working document|seed|prep|import|truth source|derived/i.test(note);
}

function handEdited(note: string | null | undefined): boolean {
  return handEditedNote(note);
}

function same(a: OnePagerBody, b: OnePagerBody): boolean {
  const pick = (x: OnePagerBody) =>
    JSON.stringify({ c: x.claims, k: x.counterclaim, l: x.language?.plain });
  return pick(a) === pick(b);
}

/**
 * Keep the one pager in step with the working document. If nobody has hand
 * edited the one pager, it is updated directly; otherwise the team gets an
 * update to accept or dismiss. Needs a person to write versions.
 */
export async function syncOnePagerFromWorkingDoc(opts: {
  caseId: string;
  teamId: string;
  personId: string | null;
}): Promise<{ status: "updated" | "proposed" | "unchanged" | "skipped" }> {
  if (!opts.personId) return { status: "skipped" };
  const brief = await ensureTeamBrief({ ...opts, personId: opts.personId });
  const sections = await listWorkingSections(brief.id);
  if (!sections.some((s) => s.body.trim())) return { status: "skipped" };

  const ticked = (
    await listAllSuggestions({ teamId: opts.teamId, caseId: opts.caseId })
  ).filter((s) => s.status === "ticked" && (s.section_key === "support" || s.section_key === "claims"));
  const body = bodyFromWorkingSections({
    sections,
    acceptedTexts: ticked.map((s) => s.stronger_version || s.text).filter(Boolean) as string[],
    thesisFallback: brief.thesis,
  });

  const current = await latestOnePager(opts.teamId, opts.caseId);
  if (current && same(current.body, body)) return { status: "unchanged" };

  if (!current || !handEdited(current.change_note)) {
    const page =
      current ??
      (await draftOnePager({
        teamId: opts.teamId,
        caseId: opts.caseId,
        personId: opts.personId,
      }));
    await saveOnePagerEdit({
      onePagerId: page.id,
      body,
      changeNote: SYNC_NOTE,
      personId: opts.personId,
    });
    return { status: "updated" };
  }

  const pending = await getPendingOnePagerSync({
    teamId: opts.teamId,
    caseId: opts.caseId,
  });
  if (pending && same(pending.proposed_body, body)) return { status: "unchanged" };
  await insertOnePagerSyncProposal({
    teamId: opts.teamId,
    caseId: opts.caseId,
    body,
    changeSummary: "The working document changed since your last edit.",
    personId: opts.personId,
  });
  return { status: "proposed" };
}

/** Kept for callers: brings the one pager in step with the working document. */
export async function proposeOnePagerFromWorkingDoc(opts: {
  caseId: string;
  teamId: string;
  personId: string;
}): Promise<{ proposed: boolean; summary: string }> {
  const r = await syncOnePagerFromWorkingDoc(opts);
  const summary =
    r.status === "updated"
      ? "One pager updated from the working document."
      : r.status === "proposed"
        ? "One pager update ready to accept."
        : r.status === "unchanged"
          ? "One pager already matches the working document."
          : "Working document is empty.";
  if (r.status === "updated" || r.status === "proposed") {
    await logActivity({
      person_id: opts.personId,
      action: r.status === "updated" ? "one_pager_synced" : "one_pager_sync_proposed",
      target: opts.caseId,
      meta: { teamId: opts.teamId },
    });
  }
  return { proposed: r.status === "updated" || r.status === "proposed", summary };
}

export async function acceptOnePagerSyncProposal(opts: {
  proposalId: string;
  personId: string;
  teamId: string;
  caseId: string;
}) {
  const pending = await getPendingOnePagerSync({
    teamId: opts.teamId,
    caseId: opts.caseId,
  });
  if (!pending || pending.id !== opts.proposalId) {
    throw new Error("No matching pending one pager update.");
  }

  let page = await latestOnePager(opts.teamId, opts.caseId);
  if (!page) {
    page = await draftOnePager({
      teamId: opts.teamId,
      caseId: opts.caseId,
      personId: opts.personId,
    });
  }

  const saved = await saveOnePagerEdit({
    onePagerId: page.id,
    body: withEmptyRows(pending.proposed_body),
    changeNote: pending.change_summary || "Accepted from working document",
    personId: opts.personId,
  });

  await decideOnePagerSync({
    id: pending.id,
    status: "accepted",
    personId: opts.personId,
  });

  await logActivity({
    person_id: opts.personId,
    action: "one_pager_sync_accepted",
    target: saved.id,
    meta: { proposalId: pending.id },
  });

  return saved;
}

export async function dismissOnePagerSyncProposal(opts: {
  proposalId: string;
  personId: string;
  teamId: string;
  caseId: string;
}) {
  const pending = await getPendingOnePagerSync({
    teamId: opts.teamId,
    caseId: opts.caseId,
  });
  if (!pending || pending.id !== opts.proposalId) {
    throw new Error("No matching pending one pager update.");
  }
  return decideOnePagerSync({
    id: pending.id,
    status: "dismissed",
    personId: opts.personId,
  });
}
