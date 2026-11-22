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
import { addWorkingDocSuggestion } from "@/lib/working-doc/suggestions";
import { proposeOnePagerFromWorkingDoc } from "@/lib/working-doc/one-pager-from-working";

function loadDomainCases(): ParsedCase[] {
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
  return out;
}

function fillFromParsed(p: ParsedCase): Record<string, string> {
  const claimBlock = [
    `Claim 1: ${p.claim1.title}`,
    p.claim1.logicLine,
    "",
    `Claim 2: ${p.claim2.title}`,
    p.claim2.logicLine,
  ]
    .filter(Boolean)
    .join("\n");

  const supportBlock = [
    ...p.claim1.supports.map(
      (s) => `${s.label}. ${s.title}${s.body ? `. ${s.body}` : ""}`,
    ),
    ...p.claim2.supports.map(
      (s) => `${s.label}. ${s.title}${s.body ? `. ${s.body}` : ""}`,
    ),
  ].join("\n");

  const cc = p.counterclaims[0];
  const objection = cc
    ? [
        cc.text,
        cc.concede ? `Concede: ${cc.concede}` : "",
        cc.distinguish ? `Distinguish: ${cc.distinguish}` : "",
        cc.rebut ? `Rebut: ${cc.rebut}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const judges = p.judgeQuestions
    .slice(0, 6)
    .map((q) => q.question)
    .join("\n");

  return {
    answer_one_sentence: p.thesis,
    claims: claimBlock,
    support: supportBlock,
    objection_reply: objection,
    values_in_tension: p.crux.replace(/\*/g, ""),
    judges_questions: judges,
  };
}

async function seedStarterSuggestions(opts: {
  caseId: string;
  teamId: string;
  personId: string;
  parsed: ParsedCase | null;
}) {
  const stakes =
    opts.parsed?.stakeholders
      .filter((s) => /no|barely|indirect/i.test(s.voice))
      .slice(0, 2)
      .map((s) => s.who) ?? [];

  const texts: Array<{ kind: "gap" | "counter" | "sharper" | "question"; text: string }> = [
    {
      kind: "gap",
      text: stakes.length
        ? `Missing perspective: speak for ${stakes[0]} in one sentence, then say how your answer still holds.`
        : "Name one stakeholder your answer still leaves out, and what they would ask you.",
    },
    {
      kind: "counter",
      text: "Steelman the other side in one sentence, then answer it with one cited fact from the case.",
    },
    {
      kind: "sharper",
      text: "Analogy check: explain your crux with one everyday comparison a judge can repeat.",
    },
    {
      kind: "question",
      text: "Research gap: which claim still has no outside source, and what would count as enough?",
    },
  ];

  for (const t of texts) {
    await addWorkingDocSuggestion({
      caseId: opts.caseId,
      teamId: opts.teamId,
      personId: opts.personId,
      kind: t.kind,
      text: t.text,
      source: "cruxy",
    });
  }
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
    await ensureWorkingSections(brief.id, opts.personId);

    const fill = parsed
      ? fillFromParsed(parsed)
      : {
          answer_one_sentence: "",
          claims: "",
          support: "",
          objection_reply: "",
          values_in_tension: "",
          judges_questions: "",
        };

    for (const [key, body] of Object.entries(fill)) {
      if (!body.trim()) continue;
      await updateWorkingSection({
        briefId: brief.id,
        sectionKey: key as
          | "answer_one_sentence"
          | "claims"
          | "support"
          | "objection_reply"
          | "values_in_tension"
          | "judges_questions",
        body,
        personId: opts.personId,
      });
    }

    await seedStarterSuggestions({
      caseId: c.id,
      teamId: opts.teamId,
      personId: opts.personId,
      parsed,
    });

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
