/**
 * Dr. B's view of one case across all three teams: each team's stance and
 * working document side by side, her comments into a team's suggestion rail,
 * moderator questions for everyone, and material sent to several teams at
 * once. Only admins in admin view reach this (see the API route).
 */
import "server-only";
import { z } from "zod";
import { runAgent } from "@/lib/cruxy/agents/runAgent";
import { sharedSystemPrefix } from "@/lib/cruxy/prompts/shared";
import { createNotification } from "@/lib/db/supabase/auth-extra";
import { listCases, listPeopleFull, listTeams, logActivity } from "@/lib/db/repository";
import { getTeamBrief } from "@/lib/db/supabase/team-brief-extra";
import {
  WORKING_SECTION_KEYS,
  WORKING_SECTION_LABELS,
  listAllSuggestions,
  listWorkingSections,
  updateSuggestionDraft,
  type WorkingSectionKey,
} from "@/lib/db/supabase/working-doc-extra";
import { addWorkingDocSuggestion } from "@/lib/working-doc/suggestions";

export type TeamStance = {
  teamId: string;
  teamName: string;
  hasDocument: boolean;
  workingPath: string | null;
  updatedAt: string | null;
  sections: { key: WorkingSectionKey; label: string; body: string }[];
  openSuggestions: number;
  coachComments: {
    id: string;
    sectionKey: string | null;
    text: string;
    suggested: string | null;
    status: string;
    by: string | null;
    createdAt: string;
  }[];
};

export type CaseOverview = {
  caseId: string;
  caseNumber: number;
  caseTitle: string;
  teams: TeamStance[];
};

export async function getCaseOverview(caseId: string): Promise<CaseOverview> {
  const [cases, teams, people] = await Promise.all([listCases(), listTeams(), listPeopleFull()]);
  const c = cases.find((x) => x.id === caseId);
  if (!c) throw new Error("Case not found.");
  const admins = new Set(people.filter((p) => p.role === "coach_admin" || p.role === "tech_admin").map((p) => p.id));
  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.name ?? null;

  const out: TeamStance[] = [];
  for (const t of teams) {
    const brief = await getTeamBrief(t.id, caseId).catch(() => null);
    const sections = brief ? await listWorkingSections(brief.id).catch(() => []) : [];
    const suggestions = await listAllSuggestions({ teamId: t.id, caseId }).catch(() => []);
    const bodies = WORKING_SECTION_KEYS.map((k) => ({
      key: k,
      label: WORKING_SECTION_LABELS[k],
      body: sections.find((s) => s.section_key === k)?.body?.trim() ?? "",
    }));
    out.push({
      teamId: t.id,
      teamName: t.name,
      hasDocument: bodies.some((b) => b.body),
      workingPath: brief?.working_path ?? null,
      updatedAt:
        sections
          .map((s) => (s as { updated_at?: string }).updated_at ?? null)
          .filter(Boolean)
          .sort()
          .pop() ?? null,
      sections: bodies,
      openSuggestions: suggestions.filter((s) => s.status === "pending").length,
      coachComments: suggestions
        .filter((s) => s.source === "member" && s.created_by && admins.has(s.created_by))
        .map((s) => ({
          id: s.id,
          sectionKey: s.section_key ?? null,
          text: s.text,
          suggested: s.stronger_version ?? null,
          status: s.status,
          by: nameOf(s.created_by),
          createdAt: s.created_at,
        })),
    });
  }
  return { caseId, caseNumber: c.number, caseTitle: c.title, teams: out };
}

async function notifyTeam(opts: {
  teamId: string;
  kind: string;
  title: string;
  body: string | null;
  href: string;
  createdBy: string;
}) {
  const people = await listPeopleFull();
  for (const p of people.filter((x) => x.team_id === opts.teamId && x.role === "member")) {
    await createNotification({
      personId: p.id,
      kind: opts.kind,
      title: opts.title,
      body: opts.body,
      href: opts.href,
      createdBy: opts.createdBy,
    }).catch(() => undefined);
  }
}

/** Dr. B comments on a team's working document; it lands in their suggestion rail. */
export async function addCoachComment(opts: {
  caseId: string;
  teamId: string;
  personId: string;
  personName: string;
  sectionKey: WorkingSectionKey | null;
  quote: string | null;
  comment: string;
  suggested: string | null;
}) {
  const comment = opts.comment.trim();
  if (!comment) throw new Error("Write a comment first.");
  const text = opts.quote?.trim() ? `On "${opts.quote.trim().slice(0, 200)}": ${comment}` : comment;
  const row = await addWorkingDocSuggestion({
    caseId: opts.caseId,
    teamId: opts.teamId,
    personId: opts.personId,
    kind: opts.suggested?.trim() ? "sharper" : "question",
    text,
    sectionKey: opts.sectionKey,
    source: "member",
  });
  if (opts.suggested?.trim() || opts.quote?.trim()) {
    await updateSuggestionDraft(row.id, {
      stronger_version: opts.suggested?.trim() || null,
      weak_spot: opts.quote?.trim() ? opts.quote.trim().slice(0, 600) : null,
    });
  }
  await logActivity({
    person_id: opts.personId,
    action: "coach_comment_added",
    target: row.id,
    meta: { caseId: opts.caseId, teamId: opts.teamId, section: opts.sectionKey },
  });
  await notifyTeam({
    teamId: opts.teamId,
    kind: "coach_comment",
    title: `${opts.personName} commented on your working document`,
    body: comment.slice(0, 160),
    href: `/case-brain/${opts.caseId}?tab=working`,
    createdBy: opts.personId,
  });
  return row;
}

export async function notifyTeamsOfReading(opts: {
  caseId: string;
  teamIds: string[];
  personId: string;
  personName: string;
  title: string;
}) {
  for (const teamId of opts.teamIds) {
    await notifyTeam({
      teamId,
      kind: "coach_reading",
      title: `${opts.personName} shared a reading`,
      body: opts.title.slice(0, 160),
      href: `/case-brain/${opts.caseId}?tab=reading`,
      createdBy: opts.personId,
    });
  }
}

export async function notifyTeamsOfQuestions(opts: {
  caseId: string;
  count: number;
  personId: string;
  personName: string;
}) {
  const teams = await listTeams();
  for (const t of teams) {
    await notifyTeam({
      teamId: t.id,
      kind: "coach_questions",
      title: `${opts.personName} added ${opts.count} moderator question${opts.count === 1 ? "" : "s"}`,
      body: null,
      href: `/revision/questions?caseId=${opts.caseId}`,
      createdBy: opts.personId,
    });
  }
}

const compareSchema = z.object({
  teams: z
    .array(
      z
        .object({
          team: z.string().catch(""),
          stance: z.string().catch(""),
          strongest: z.string().catch(""),
          weakest: z.string().catch(""),
        })
        .passthrough(),
    )
    .catch([]),
  differences: z.array(z.string()).catch([]),
  shared_gaps: z.array(z.string()).catch([]),
  questions: z.array(z.string()).catch([]),
});
export type StanceComparison = z.infer<typeof compareSchema>;

/** Cruxy reads all three documents and tells Dr. B where they differ. */
export async function compareStances(opts: { caseId: string; personId: string }): Promise<StanceComparison | null> {
  const ov = await getCaseOverview(opts.caseId);
  const withDocs = ov.teams.filter((t) => t.hasDocument);
  if (!withDocs.length) return null;
  const docs = withDocs
    .map(
      (t) =>
        `=== ${t.teamName} ===\n` +
        t.sections.map((s) => `${s.label}:\n${s.body.slice(0, 2500) || "(empty)"}`).join("\n\n"),
    )
    .join("\n\n");
  const res = await runAgent({
    agent: "coach",
    feature: "coach_compare_stances",
    tier: "strong",
    system: [
      sharedSystemPrefix(),
      "",
      `Task: the coach wants a fast read of where each of her teams stands on case ${ov.caseNumber}, "${ov.caseTitle}", without reading every document.`,
      "For each team: stance (their one sentence answer in plain words, or what their document implies), strongest (the best part of their argument), weakest (the gap a judge would hit first). Quote short phrases from the document where it helps.",
      "differences: the real points where the teams disagree or reason differently, each naming the teams.",
      "shared_gaps: objections, stakeholders or values none of the teams handle.",
      "questions: up to 6 sharp moderator or judge questions that would test all the teams on this case.",
      "This is for the coach only. Plain words. No em dashes.",
      'Return JSON only: {"teams":[{"team","stance","strongest","weakest"}],"differences":[],"shared_gaps":[],"questions":[]}',
    ].join("\n"),
    user: docs.slice(0, 40_000),
    schema: compareSchema,
    personId: opts.personId,
    estimatedCostUsd: 0.06,
  }).catch(() => null);
  if (!res || !res.ok || res.stub) return null;
  await logActivity({
    person_id: opts.personId,
    action: "coach_compare_stances",
    target: opts.caseId,
    meta: { teams: withDocs.length },
  });
  return res.data as StanceComparison;
}
