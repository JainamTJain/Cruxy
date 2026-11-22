/**
 * Shared truth source per case. Feeds critique suggestions only.
 * Never exposes one team's working document, one pager, or roles to another.
 */
import "server-only";

import { readFile } from "fs/promises";
import path from "path";
import { listCases } from "@/lib/db/repository";
import { isSampleDataMode } from "@/lib/db/config";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import { listResearchRuns, listLibraryFiles } from "@/lib/db/library-repository";
import { readStore } from "@/lib/db/sample-store";
import { listSessions } from "@/lib/db/practice-repository";
import { getTranscript } from "@/lib/db/practice-repository";
import type { TruthSourceItem } from "@/lib/critique/types";

function scrub(s: string): string {
  return s.replace(/[·—–]/g, ",").replace(/\s+/g, " ").trim();
}

async function loadDomainPrep(caseNumber: number): Promise<TruthSourceItem[]> {
  const pad = String(caseNumber).padStart(2, "0");
  const file = path.join(
    process.cwd(),
    "docs",
    "domain",
    "cases",
    `case-${pad}.md`,
  );
  try {
    const md = await readFile(file, "utf8");
    // Drop the one-pager section if present (case-workflow-v2).
    const withoutPager = md.split(/\n##\s+12\.\s+One.pager/i)[0] ?? md;
    const chunks = withoutPager
      .split(/\n##\s+/)
      .map((c) => scrub(c))
      .filter((c) => c.length > 40)
      .slice(0, 12);
    return chunks.map((text, i) => ({
      id: `domain:${caseNumber}:${i}`,
      kind: "domain_prep" as const,
      label: `Case prep §${i + 1}`,
      text: text.slice(0, 1200),
      ref: `docs/domain/cases/case-${pad}.md`,
    }));
  } catch {
    return [];
  }
}

async function loadCaseSet(caseId: string): Promise<TruthSourceItem[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const c = store.cases.find((x) => x.id === caseId);
    if (!c) return [];
    const truths = store.truth_items
      .filter((t) => t.case_id === caseId && t.status === "accepted")
      .slice(0, 20);
    const fromTruth = truths.map((t, i) => ({
      id: `case_set:truth:${t.id}`,
      kind: "case_set" as const,
      label: `Case fact ${i + 1}`,
      text: scrub(t.text).slice(0, 600),
      ref: t.id,
    }));
    return [
      {
        id: `case_set:title:${c.id}`,
        kind: "case_set",
        label: `Case ${c.number}`,
        text: scrub(`${c.title}`),
        ref: c.id,
      },
      ...fromTruth,
    ];
  }

  const sb = getServiceSupabase();
  const { data: caseRow } = await sb
    .from("cases")
    .select("id,number,title")
    .eq("id", caseId)
    .maybeSingle();
  const { data: truths } = await sb
    .from("truth_items")
    .select("id,text,kind,status")
    .eq("case_id", caseId)
    .eq("status", "accepted")
    .limit(20);
  const items: TruthSourceItem[] = [];
  if (caseRow) {
    items.push({
      id: `case_set:title:${caseRow.id}`,
      kind: "case_set",
      label: `Case ${caseRow.number}`,
      text: scrub(String(caseRow.title ?? "")),
      ref: String(caseRow.id),
    });
  }
  for (const [i, t] of (truths ?? []).entries()) {
    items.push({
      id: `case_set:truth:${t.id}`,
      kind: "case_set",
      label: `Case fact ${i + 1}`,
      text: scrub(String(t.text ?? "")).slice(0, 600),
      ref: String(t.id),
    });
  }
  return items;
}

async function loadResearch(caseId: string): Promise<TruthSourceItem[]> {
  const runs = (await listResearchRuns(20)).filter((r) => r.case_id === caseId);
  const items: TruthSourceItem[] = [];
  for (const run of runs.slice(0, 3)) {
    for (const f of (run.findings ?? []).slice(0, 3)) {
      items.push({
        id: `research:${f.id}`,
        kind: "research",
        label: scrub(f.title || f.point || "Research finding").slice(0, 80),
        text: scrub(
          [f.point, f.quote, f.why_it_matters].filter(Boolean).join(" "),
        ).slice(0, 800),
        ref: f.id,
      });
    }
  }
  return items;
}

async function loadTranscripts(caseId: string): Promise<TruthSourceItem[]> {
  const items: TruthSourceItem[] = [];
  try {
    const sessions = await listSessions({});
    const rounds = sessions.flatMap((s) =>
      (s.rounds ?? []).filter((r) => r.case_id === caseId),
    );
    for (const round of rounds.slice(0, 4)) {
      const lines = await getTranscript(round.id);
      const sample = lines
        .slice(0, 12)
        .map((l) => scrub(l.text))
        .filter(Boolean)
        .join(" ");
      if (sample.length < 40) continue;
      items.push({
        id: `transcript:${round.id}`,
        kind: "transcript",
        label: "Practice transcript",
        text: sample.slice(0, 900),
        ref: round.id,
      });
    }
  } catch {
    // Practice path may be empty in early sample boots.
  }

  // Library files tagged as practice transcripts for this case.
  try {
    const files = await listLibraryFiles();
    for (const f of files
      .filter(
        (x) =>
          x.type === "practice_transcript" &&
          (x.case_ids?.includes(caseId) || /transcript/i.test(x.name)),
      )
      .slice(0, 3)) {
      items.push({
        id: `transcript:file:${f.id}`,
        kind: "transcript",
        label: scrub(f.name).slice(0, 80),
        text: scrub(f.text_content || f.name).slice(0, 900),
        ref: f.id,
      });
    }
  } catch {
    // ignore
  }
  return items;
}

/**
 * Ideas Cruxy already judged valuable enough to travel.
 * Returns anonymous text only; never the source team name.
 */
async function loadTraveledIdeas(caseId: string): Promise<TruthSourceItem[]> {
  if (isSampleDataMode()) {
    try {
      const store = await readStore();
      const bag = store as unknown as {
        idea_travel_scores?: Array<{
          id: string;
          case_id: string;
          traveled: boolean;
          would_help_win: boolean;
          idea_text: string;
          reason: string;
        }>;
      };
      return (bag.idea_travel_scores ?? [])
        .filter(
          (r) =>
            r.case_id === caseId && (r.traveled || r.would_help_win),
        )
        .slice(0, 12)
        .map((r, i) => ({
          id: `travel:${r.id}`,
          kind: "traveled_idea" as const,
          label: `Shared idea ${i + 1}`,
          text: scrub(r.idea_text).slice(0, 600),
          ref: r.id,
        }));
    } catch {
      return [];
    }
  }

  try {
    const { data, error } = await getServiceSupabase()
      .from("idea_travel_scores")
      .select("id,idea_text,traveled,would_help_win,case_id")
      .eq("case_id", caseId)
      .or("traveled.eq.true,would_help_win.eq.true")
      .order("created_at", { ascending: false })
      .limit(12);
    if (error || !data) return [];
    return data.map((r, i) => ({
      id: `travel:${r.id}`,
      kind: "traveled_idea" as const,
      label: `Shared idea ${i + 1}`,
      text: scrub(String(r.idea_text ?? "")).slice(0, 600),
      ref: String(r.id),
    }));
  } catch {
    return [];
  }
}

/** Build the shared truth source for one case (suggestion feed only). */
export async function buildTruthSource(caseId: string): Promise<{
  caseNumber: number | null;
  caseTitle: string | null;
  items: TruthSourceItem[];
}> {
  const cases = await listCases();
  const c = cases.find((x) => x.id === caseId) ?? null;
  const [caseSet, domain, research, transcripts, traveled] = await Promise.all([
    loadCaseSet(caseId),
    c ? loadDomainPrep(c.number) : Promise.resolve([]),
    loadResearch(caseId),
    loadTranscripts(caseId),
    loadTraveledIdeas(caseId),
  ]);
  return {
    caseNumber: c?.number ?? null,
    caseTitle: c?.title ?? null,
    items: [...caseSet, ...domain, ...research, ...transcripts, ...traveled],
  };
}

export function findCite(
  items: TruthSourceItem[],
  needle: string,
): TruthSourceItem | null {
  const n = needle.toLowerCase();
  if (!n) return items[0] ?? null;
  return (
    items.find((i) => i.text.toLowerCase().includes(n.slice(0, 24))) ??
    items[0] ??
    null
  );
}
