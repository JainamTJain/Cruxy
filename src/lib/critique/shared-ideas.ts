/**
 * When members of different teams highlight or comment on the same idea,
 * score it against APPE criteria. If it holds value, raise an anonymous
 * suggestion on the other teams' rails (never show the source team).
 */
import "server-only";

import { z } from "zod";
import { runAgent } from "@/lib/cruxy/agents/runAgent";
import { listTeams, listPeopleFull, logActivity } from "@/lib/db/repository";
import {
  listLibraryFiles,
  listHighlightsForFile,
  listCommentsForFile,
} from "@/lib/db/library-repository";
import { postSuggestions } from "@/lib/working-doc/post-suggestions";

const TRAVEL_MIN = 7.5;

const scoreSchema = z.object({
  appe_score: z.number().min(1).max(10),
  would_help_win: z.boolean(),
  well_supported: z.boolean(),
  reason: z.string().min(8).max(500),
  anonymous_suggestion: z.string().min(12).max(480),
  kind: z.enum([
    "missing_perspective",
    "missing_stakeholder",
    "unanswered_counter",
    "evidence_gap",
    "sharper_wording",
    "question",
  ]),
});

function normalizeIdea(text: string): string {
  return text
    .toLowerCase()
    .replace(/[·—–]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similar(a: string, b: string): boolean {
  const na = normalizeIdea(a);
  const nb = normalizeIdea(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length < 12 || nb.length < 12) return false;
  return na.includes(nb.slice(0, 24)) || nb.includes(na.slice(0, 24));
}

type Anno = {
  text: string;
  personId: string;
  teamId: string | null;
  kind: "highlight" | "comment";
  id: string;
};

async function collectAnnotations(caseId: string): Promise<Anno[]> {
  const people = await listPeopleFull();
  const teamOf = new Map(people.map((p) => [p.id, p.team_id]));
  const files = (await listLibraryFiles()).filter(
    (f) => f.case_ids?.includes(caseId) || f.type === "case_set",
  );
  const out: Anno[] = [];
  for (const f of files.slice(0, 8)) {
    const [hs, cs] = await Promise.all([
      listHighlightsForFile(f.id),
      listCommentsForFile(f.id),
    ]);
    for (const h of hs) {
      const text = (h.body || h.range || "").trim();
      if (text.length < 12) continue;
      out.push({
        text,
        personId: h.person_id,
        teamId: teamOf.get(h.person_id) ?? null,
        kind: "highlight",
        id: h.id,
      });
    }
    for (const c of cs) {
      const text = (c.body || "").trim();
      if (text.length < 12) continue;
      out.push({
        text,
        personId: c.person_id,
        teamId: teamOf.get(c.person_id) ?? null,
        kind: "comment",
        id: c.id,
      });
    }
  }
  return out;
}

type Cluster = { text: string; teamIds: Set<string>; sampleIds: string[] };

function clusterAcrossTeams(annos: Anno[]): Cluster[] {
  const clusters: Cluster[] = [];
  for (const a of annos) {
    if (!a.teamId) continue;
    let hit = clusters.find((c) => similar(c.text, a.text));
    if (!hit) {
      hit = { text: a.text, teamIds: new Set(), sampleIds: [] };
      clusters.push(hit);
    }
    hit.teamIds.add(a.teamId);
    hit.sampleIds.push(a.id);
  }
  return clusters.filter((c) => c.teamIds.size >= 2);
}

async function scoreSharedIdea(idea: string, caseId: string, personId: string | null) {
  const fallback = () => ({
    appe_score: idea.split(/\s+/).length >= 16 ? 7 : 5,
    would_help_win: idea.split(/\s+/).length >= 20,
    well_supported: idea.split(/\s+/).length >= 16,
    reason: "Heuristic score without a live model.",
    anonymous_suggestion: idea.replace(/[·—–]/g, ",").slice(0, 400),
    kind: "sharper_wording" as const,
  });

  const result = await runAgent({
    agent: "analyst",
    feature: "shared_idea_travel",
    tier: "strong",
    system: [
      "You score whether a shared Ethics Bowl idea should travel anonymously to other USC teams.",
      "Use APPE presentation A/B/C and judges' Q&A spirit. Score 1-10.",
      "would_help_win only if strong AND well supported. Never name a team.",
      "Output JSON only.",
    ].join(" "),
    user: `Case id: ${caseId}\nShared idea:\n${idea}`,
    schema: scoreSchema,
    personId,
    fixtureKey: "shared_idea_travel",
    estimatedCostUsd: 0.02,
    stubFallback: fallback,
  });
  return result.ok ? result.data : fallback();
}

/**
 * Find cross-team shared highlights/comments, score them, post anonymous
 * suggestions to teams that have not already raised the idea.
 */
export async function raiseSharedIdeas(opts: {
  caseId: string;
  personId: string | null;
}): Promise<{ clusters: number; traveled: number; posted: number }> {
  const annos = await collectAnnotations(opts.caseId);
  const clusters = clusterAcrossTeams(annos);
  const teams = await listTeams();
  let traveled = 0;
  let posted = 0;

  for (const cluster of clusters.slice(0, 6)) {
    const scored = await scoreSharedIdea(
      cluster.text,
      opts.caseId,
      opts.personId,
    );
    const may =
      scored.would_help_win &&
      scored.well_supported &&
      scored.appe_score >= TRAVEL_MIN;
    if (!may) continue;
    traveled += 1;

    const recipients = teams.filter((t) => !cluster.teamIds.has(t.id));
    if (!recipients.length) continue;

    const anon = scored.anonymous_suggestion
      .replace(/[·—–]/g, ",")
      .replace(/\b(team\s*[123]|inspired by)\b/gi, "another view")
      .trim();

    const { posted: rows } = await postSuggestions(
      recipients.map((t) => ({
        caseId: opts.caseId,
        teamId: t.id,
        personId: null,
        kind: scored.kind,
        sectionKey: "claims",
        text: [
          `Where it is weak: this angle is still thin on your page.`,
          `Why: another view raised a point judges may press.`,
          `Stronger: ${anon}`,
          `What do you think?`,
        ].join(" "),
        source: "anonymous_travel",
        strongerVersion: anon,
        questionBack: "What do you think?",
        cannotCite: true,
        truthSourceRef: "Shared idea (anonymous)",
      })),
    );
    posted += rows.length;

    await logActivity({
      person_id: opts.personId,
      action: "shared_idea_traveled",
      target: opts.caseId,
      meta: {
        score: scored.appe_score,
        teams: recipients.length,
        samples: cluster.sampleIds.slice(0, 4),
      },
    });
  }

  return { clusters: clusters.length, traveled, posted };
}
