/**
 * "Start our working documents": one Crux working doc per active case,
 * filled from docs/domain/cases (skip one-pager pages) plus starter suggestions.
 */
import "server-only";

import fs from "fs";
import path from "path";
import { ensureTeamBrief } from "@/lib/case-brain/team-brief";
import { listCases, logActivity } from "@/lib/db/repository";
import {
  ensureWorkingSections,
  updateWorkingSection,
} from "@/lib/db/supabase/working-doc-extra";
import { upsertTeamBrief } from "@/lib/db/supabase/team-brief-extra";
import { parseCaseMarkdown, type ParsedCase } from "@/lib/seed/parse-case";
import { proposeOnePagerFromWorkingDoc } from "@/lib/working-doc/one-pager-from-working";

let domainCache: ParsedCase[] | null = null;

function loadDomainCases(): ParsedCase[] {
  if (domainCache) return domainCache;
  const dir = path.join(process.cwd(), "docs/domain/cases");
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^case-\d+\.md$/i.test(f))
    .sort();
  const out: ParsedCase[] = [];
  for (const f of files) {
    const md = fs.readFileSync(path.join(dir, f), "utf8");
    // Drop the leading blank one-pager page; keep the detailed review.
    const cut = md.search(/#\s*Case\s+\d+.*detailed review/i);
    const body = cut >= 0 ? md.slice(cut) : md;
    try {
      out.push(parseCaseMarkdown(body));
    } catch {
      // Skip unreadable files rather than failing the whole start.
    }
  }
  if (out.length) domainCache = out;
  return out;
}

/** The truth source (case prep, minus its one-pager page) for one case. */
export function truthSourceForCase(caseNumber: number): ParsedCase | null {
  return loadDomainCases().find((d) => d.number === caseNumber) ?? null;
}

function clean(s: string): string {
  return s.replace(/\*\*/g, "").replace(/\*/g, "").replace(/[—–·]/g, ",").trim();
}

export function fillFromParsed(p: ParsedCase): Record<string, string> {
  const claim = (label: string, c: ParsedCase["claim1"]) =>
    [
      `${label}: ${c.title}`,
      c.logicLine ? `Logic line: ${c.logicLine}` : "",
      c.ethicalAnalysis ? `Ethical analysis: ${c.ethicalAnalysis}` : "",
      c.concede ? `We concede: ${c.concede}` : "",
    ]
      .filter(Boolean)
      .join("\n");

  const supports = (label: string, c: ParsedCase["claim1"]) =>
    c.supports.length
      ? [
          `${label}: ${c.title}`,
          ...c.supports.map((s) =>
            [
              `${s.label}. ${s.title}${s.body ? `. ${s.body}` : ""}`,
              s.backing?.text ? `   Backing: ${s.backing.text}` : "",
            ]
              .filter(Boolean)
              .join("\n"),
          ),
        ].join("\n")
      : "";

  const objections = p.counterclaims
    .map((cc, i) =>
      [
        `Objection ${i + 1}: ${cc.text}`,
        cc.theirSupports ? `Their support: ${cc.theirSupports}` : "",
        cc.concede ? `Concede: ${cc.concede}` : "",
        cc.distinguish ? `Distinguish: ${cc.distinguish}` : "",
        cc.rebut ? `Rebut: ${cc.rebut}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");

  const values = [
    p.crux ? `Crux: ${p.crux}` : "",
    p.trap ? `The trap: ${p.trap}` : "",
    p.stakeholders.length
      ? [
          "Stakeholders:",
          ...p.stakeholders.map(
            (s) =>
              `${s.who}: ${s.stake}${s.voice ? ` (voice in the case: ${s.voice})` : ""}`,
          ),
        ].join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const questions = [...p.moderatorQuestions, ...p.judgeQuestions]
    .slice(0, 10)
    .map((q) => `Q: ${q.question}${q.answer ? `\nA: ${q.answer}` : ""}`)
    .join("\n\n");

  const out: Record<string, string> = {
    answer_one_sentence: p.thesis,
    claims: [claim("Claim 1", p.claim1), claim("Claim 2", p.claim2)]
      .filter(Boolean)
      .join("\n\n"),
    support: [supports("Claim 1", p.claim1), supports("Claim 2", p.claim2)]
      .filter(Boolean)
      .join("\n\n"),
    objection_reply: objections,
    values_in_tension: values,
    judges_questions: questions,
  };
  for (const k of Object.keys(out)) out[k] = clean(out[k] ?? "");
  return out;
}

type SectionKey =
  | "answer_one_sentence"
  | "claims"
  | "support"
  | "objection_reply"
  | "values_in_tension"
  | "judges_questions";

/**
 * Fill a team's working document for one case from the truth source.
 * Only empty sections are written, so a team's own words are never replaced.
 * Returns how many sections were filled.
 */
export async function fillWorkingDocFromTruth(opts: {
  briefId: string;
  caseNumber: number;
  personId: string | null;
  existing?: Record<string, string>;
  /** Case id, to include Cruxy's shared additions to the truth source. */
  caseId?: string;
}): Promise<number> {
  const parsed = truthSourceForCase(opts.caseNumber);
  if (!parsed) return 0;
  const fill = fillFromParsed(parsed);
  // Cruxy's anonymous additions from the teams join the section they belong to.
  if (opts.caseId) {
    const { listTruthAdditions } = await import("@/lib/critique/truth-additions");
    for (const a of await listTruthAdditions(opts.caseId)) {
      const k = a.sectionKey as keyof typeof fill;
      fill[k] = [fill[k] ?? "", `Added by Cruxy from the teams: ${a.text}`]
        .filter((x) => x.trim())
        .join("\n\n");
    }
  }
  let n = 0;
  for (const [key, body] of Object.entries(fill)) {
    if (!body.trim()) continue;
    if ((opts.existing?.[key] ?? "").trim()) continue;
    await updateWorkingSection({
      briefId: opts.briefId,
      sectionKey: key as SectionKey,
      body,
      personId: opts.personId,
    });
    n += 1;
  }
  return n;
}

/**
 * A team with no working document gets the truth source as its document, so
 * there is always something real to edit, critique and draw the one pager from.
 * Importing their own documents later replaces it. Returns true if started.
 */
export async function ensureStartedFromTruth(opts: {
  caseId: string;
  teamId: string;
  personId: string | null;
}): Promise<boolean> {
  const brief = await ensureTeamBrief({
    teamId: opts.teamId,
    caseId: opts.caseId,
    personId: opts.personId,
  });
  const row = (await listCases()).find((c) => c.id === opts.caseId);
  if (!row) return false;

  // Path already set: still fill any empty sections from the truth source so
  // the one pager always has something real to draw from.
  if (brief.working_path) {
    const sections = await ensureWorkingSections(brief.id, opts.personId);
    const filled = await fillWorkingDocFromTruth({
      briefId: brief.id,
      caseNumber: row.number,
      personId: opts.personId,
      caseId: opts.caseId,
      existing: Object.fromEntries(
        sections.map((x) => [x.section_key, x.body ?? ""]),
      ),
    });
    if (filled === 0) return false;
    const { syncOnePagerFromWorkingDoc } = await import(
      "@/lib/working-doc/one-pager-from-working"
    );
    await syncOnePagerFromWorkingDoc({
      caseId: opts.caseId,
      teamId: opts.teamId,
      personId: opts.personId,
    }).catch(() => undefined);
    return true;
  }

  const started = await upsertTeamBrief({
    team_id: opts.teamId,
    case_id: opts.caseId,
    mode: "build_in_crux",
    working_path: "crux",
    created_by: opts.personId,
  });
  const sections = await ensureWorkingSections(started.id, opts.personId);
  const filled = await fillWorkingDocFromTruth({
    briefId: started.id,
    caseNumber: row.number,
    personId: opts.personId,
    caseId: opts.caseId,
    existing: Object.fromEntries(sections.map((x) => [x.section_key, x.body ?? ""])),
  });
  if (filled === 0) return false;
  const { syncOnePagerFromWorkingDoc } = await import(
    "@/lib/working-doc/one-pager-from-working"
  );
  await syncOnePagerFromWorkingDoc({
    caseId: opts.caseId,
    teamId: opts.teamId,
    personId: opts.personId,
  }).catch(() => undefined);
  await logActivity({
    person_id: opts.personId,
    action: "working_doc_started_from_truth",
    target: opts.caseId,
    meta: { teamId: opts.teamId, sections: filled, automatic: true },
  });
  return true;
}


export async function startAllWorkingDocuments(opts: {
  teamId: string;
  personId: string;
}): Promise<{ started: number; caseIds: string[] }> {
  const cases = (await listCases()).filter((c) => c.active);
  const domain = loadDomainCases();
  const byNum = new Map(domain.map((d) => [d.number, d]));
  const caseIds: string[] = [];

  for (const c of cases) {
    const parsed = byNum.get(c.number) ?? null;
    const brief = await upsertTeamBrief({
      team_id: opts.teamId,
      case_id: c.id,
      mode: "build_in_crux",
      working_path: "crux",
      thesis: parsed?.thesis ?? null,
      created_by: opts.personId,
    });
    const sections = await ensureWorkingSections(brief.id, opts.personId);
    const existing = Object.fromEntries(
      sections.map((x) => [x.section_key, x.body ?? ""]),
    );
    await fillWorkingDocFromTruth({
      briefId: brief.id,
      caseNumber: c.number,
      caseId: c.id,
      personId: opts.personId,
      existing,
    });

    // Cruxy critiques the new document right after this (see the route).

    void proposeOnePagerFromWorkingDoc({
      caseId: c.id,
      teamId: opts.teamId,
      personId: opts.personId,
    }).catch(() => undefined);

    caseIds.push(c.id);
  }

  await logActivity({
    person_id: opts.personId,
    action: "working_docs_started_all",
    target: opts.teamId,
    meta: { count: caseIds.length },
  });

  return { started: caseIds.length, caseIds };
}
