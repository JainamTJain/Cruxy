/**
 * Orchestrate a critique run for one team/case (on-change, nightly, manual).
 */
import "server-only";

import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import { logActivity, listTeams, listCases } from "@/lib/db/repository";
import { ensureTeamBrief } from "@/lib/case-brain/team-brief";
import {
  listWorkingSections,
  ensureWorkingSections,
} from "@/lib/db/supabase/working-doc-extra";
import { critiqueWorkingDocument } from "@/lib/critique/engine";
import { raiseSharedIdeas } from "@/lib/critique/shared-ideas";
import type { CritiqueRunResult } from "@/lib/critique/types";

type Trigger = "on_change" | "nightly" | "manual" | "shared_ideas";

type CritiqueRunRow = {
  id: string;
  case_id: string;
  team_id: string;
  trigger: Trigger;
  status: "queued" | "running" | "done" | "skipped" | "error";
  suggestions_posted: number;
  notes: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  created_by: string | null;
};

const sampleRuns: CritiqueRunRow[] = [];
const lastDoneAt = new Map<string, number>();
const DEBOUNCE_MS = 30_000;

function nowIso() {
  return new Date().toISOString();
}

async function recordRun(
  row: CritiqueRunRow,
): Promise<void> {
  if (isSampleDataMode()) {
    sampleRuns.unshift(row);
    return;
  }
  const { error } = await getServiceSupabase().from("critique_runs").insert({
    id: row.id,
    case_id: row.case_id,
    team_id: row.team_id,
    trigger: row.trigger,
    status: row.status,
    suggestions_posted: row.suggestions_posted,
    notes: row.notes,
    started_at: row.started_at,
    finished_at: row.finished_at,
    created_by: row.created_by,
  });
  if (error) {
    // Table may not be applied yet in some environments; do not fail the critique.
    console.warn("critique_runs insert:", error.message);
  }
}

function shouldSkipDebounce(teamId: string, caseId: string, trigger: Trigger): boolean {
  if (trigger !== "on_change") return false;
  const key = `${teamId}:${caseId}`;
  const last = lastDoneAt.get(key) ?? 0;
  return Date.now() - last < DEBOUNCE_MS;
}

export async function runCritiqueForTeamCase(opts: {
  caseId: string;
  teamId: string;
  personId: string | null;
  trigger: Trigger;
  rulesOnly?: boolean;
}): Promise<CritiqueRunResult> {
  if (shouldSkipDebounce(opts.teamId, opts.caseId, opts.trigger)) {
    const skipped: CritiqueRunResult = {
      caseId: opts.caseId,
      teamId: opts.teamId,
      posted: 0,
      skippedCap: 0,
      findings: [],
      notes: "Skipped: on-change debounce (wait a few seconds).",
    };
    await recordRun({
      id: randomUUID(),
      case_id: opts.caseId,
      team_id: opts.teamId,
      trigger: opts.trigger,
      status: "skipped",
      suggestions_posted: 0,
      notes: skipped.notes,
      started_at: nowIso(),
      finished_at: nowIso(),
      created_at: nowIso(),
      created_by: opts.personId,
    });
    return skipped;
  }

  const started = nowIso();
  // No working document yet: the team works from the truth source.
  const { ensureStartedFromTruth } = await import(
    "@/lib/working-doc/start-all-from-truth"
  );
  await ensureStartedFromTruth({
    caseId: opts.caseId,
    teamId: opts.teamId,
    personId: opts.personId,
  }).catch(() => false);
  const brief = await ensureTeamBrief({
    teamId: opts.teamId,
    caseId: opts.caseId,
    personId: opts.personId,
  });
  await ensureWorkingSections(brief.id, opts.personId);
  const sections = await listWorkingSections(brief.id);
  // Never critique an empty document: it only produces generic advice.
  if (!sections.some((x) => x.body.trim().length > 20)) {
    await recordRun({
      id: randomUUID(),
      case_id: opts.caseId,
      team_id: opts.teamId,
      trigger: opts.trigger,
      status: "skipped",
      suggestions_posted: 0,
      notes: "empty document",
      started_at: started,
      finished_at: nowIso(),
      created_at: nowIso(),
      created_by: opts.personId,
    });
    return {
      caseId: opts.caseId,
      teamId: opts.teamId,
      posted: 0,
      skippedCap: 0,
      findings: [],
      notes: "empty document",
    };
  }

  const critique = await critiqueWorkingDocument({
    caseId: opts.caseId,
    teamId: opts.teamId,
    personId: opts.personId,
    sections,
    rulesOnly: opts.rulesOnly,
  });

  let sharedPosted = 0;
  // shared_ideas trigger only: nightly orchestration calls raiseSharedIdeas once per case.
  if (opts.trigger === "shared_ideas") {
    const shared = await raiseSharedIdeas({
      caseId: opts.caseId,
      personId: opts.personId,
    });
    sharedPosted = shared.posted;
  }

  const posted = critique.posted + sharedPosted;
  lastDoneAt.set(`${opts.teamId}:${opts.caseId}`, Date.now());

  await recordRun({
    id: randomUUID(),
    case_id: opts.caseId,
    team_id: opts.teamId,
    trigger: opts.trigger,
    status: "done",
    suggestions_posted: posted,
    notes: `truth=${critique.truthCount}; capSkip=${critique.skippedCap}; shared=${sharedPosted}; ${critique.modelNote}`,
    started_at: started,
    finished_at: nowIso(),
    created_at: nowIso(),
    created_by: opts.personId,
  });

  await logActivity({
    person_id: opts.personId,
    action: "critique_run",
    target: opts.caseId,
    meta: {
      team_id: opts.teamId,
      trigger: opts.trigger,
      posted,
      skipped_cap: critique.skippedCap,
    },
  });

  return {
    caseId: opts.caseId,
    teamId: opts.teamId,
    posted,
    skippedCap: critique.skippedCap,
    findings: critique.findings,
    notes: null,
  };
}

/** Nightly: every active case × every team, plus one shared-idea pass per case. */
export async function runNightlyCritique(opts?: {
  personId?: string | null;
  rulesOnly?: boolean;
}): Promise<{ runs: number; posted: number }> {
  const [cases, teams] = await Promise.all([listCases(), listTeams()]);
  const active = cases.filter((c) => c.active);
  let runs = 0;
  let posted = 0;
  for (const c of active) {
    for (const t of teams) {
      const r = await runCritiqueForTeamCase({
        caseId: c.id,
        teamId: t.id,
        personId: opts?.personId ?? null,
        trigger: "nightly",
        rulesOnly: opts?.rulesOnly,
      });
      runs += 1;
      posted += r.posted;
    }
    // One cross-team shared-idea pass per case (not once per team).
    const shared = await raiseSharedIdeas({
      caseId: c.id,
      personId: opts?.personId ?? null,
    });
    posted += shared.posted;
    runs += 1;
  }
  return { runs, posted };
}

/**
 * In-process debounce for serverless after() hooks. Returns a promise that
 * settles once this request's critique has run (or been superseded by a newer
 * edit), so after() keeps the function alive until the work is done.
 */
const timers = new Map<
  string,
  { handle: ReturnType<typeof setTimeout>; settle: () => void }
>();

export function scheduleCritiqueOnChange(opts: {
  caseId: string;
  teamId: string;
  personId: string | null;
  delayMs?: number;
}): Promise<void> {
  const key = `${opts.teamId}:${opts.caseId}`;
  const prev = timers.get(key);
  if (prev) {
    clearTimeout(prev.handle);
    prev.settle();
  }
  const delay = opts.delayMs ?? 8_000;
  return new Promise<void>((resolve) => {
    const handle = setTimeout(() => {
      timers.delete(key);
      void runCritiqueForTeamCase({
        caseId: opts.caseId,
        teamId: opts.teamId,
        personId: opts.personId,
        trigger: "on_change",
      })
        .catch(() => undefined)
        .finally(resolve);
    }, delay);
    timers.set(key, { handle, settle: resolve });
  });
}

/** Run critique now for several team/case pairs, one after another. */
export async function critiqueNow(
  pairs: Array<{ caseId: string; teamId: string }>,
  personId: string | null,
  opts?: { onlyStartedDocs?: boolean },
): Promise<number> {
  let posted = 0;
  for (const p of pairs) {
    try {
      if (opts?.onlyStartedDocs) {
        const brief = await ensureTeamBrief({
          teamId: p.teamId,
          caseId: p.caseId,
          personId,
        });
        // No working document yet: nothing to critique against.
        if (!brief.working_path) continue;
      }
      const r = await runCritiqueForTeamCase({
        caseId: p.caseId,
        teamId: p.teamId,
        personId,
        trigger: "manual",
      });
      posted += r.posted;
    } catch {
      // One case failing should not stop the rest.
    }
  }
  return posted;
}
