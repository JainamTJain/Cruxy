/**
 * Coherence check: Cruxy reviews the working document for missing perspectives,
 * missing stakeholders, claims that do not connect to the one-sentence answer,
 * and loose ends. Each finding becomes a suggestion with tick and cross.
 */
import "server-only";

import { z } from "zod";
import { ensureTeamBrief } from "@/lib/case-brain/team-brief";
import { runAgent } from "@/lib/cruxy/agents/runAgent";
import { logActivity } from "@/lib/db/repository";
import {
  WORKING_SECTION_LABELS,
  insertSuggestion,
  listWorkingSections,
  type WorkingSectionKey,
} from "@/lib/db/supabase/working-doc-extra";

const findingSchema = z.object({
  findings: z
    .array(
      z.object({
        kind: z.enum(["gap", "counter", "sharper", "question"]),
        section_key: z
          .enum([
            "answer_one_sentence",
            "claims",
            "support",
            "objection_reply",
            "values_in_tension",
            "judges_questions",
          ])
          .nullable(),
        text: z.string().min(12).max(500),
      }),
    )
    .max(8),
});

type Findings = z.infer<typeof findingSchema>;

function stubFindings(summary: string): Findings {
  const empty = !summary.trim() || summary.includes("(empty)");
  if (empty) {
    return {
      findings: [
        {
          kind: "gap",
          section_key: "answer_one_sentence",
          text: "Write your one-sentence answer first so claims can connect to it.",
        },
        {
          kind: "question",
          section_key: "claims",
          text: "Name one stakeholder your answer still leaves out, and what they would ask.",
        },
      ],
    };
  }
  return {
    findings: [
      {
        kind: "gap",
        section_key: "values_in_tension",
        text: "Name a perspective that would reject your answer, and why it still deserves weight.",
      },
      {
        kind: "sharper",
        section_key: "claims",
        text: "Show how each claim links back to your one-sentence answer in one clause.",
      },
      {
        kind: "question",
        section_key: "judges_questions",
        text: "What loose end would a judge press if they only heard your strongest claim?",
      },
    ],
  };
}

export async function runCoherenceCheck(opts: {
  caseId: string;
  teamId: string;
  personId: string;
}): Promise<{ added: number; texts: string[] }> {
  const brief = await ensureTeamBrief({
    teamId: opts.teamId,
    caseId: opts.caseId,
    personId: opts.personId,
  });
  const sections = await listWorkingSections(brief.id);
  const filled = sections
    .map(
      (s) =>
        `${WORKING_SECTION_LABELS[s.section_key]}:\n${s.body.trim() || "(empty)"}`,
    )
    .join("\n\n");
  const answer =
    sections.find((s) => s.section_key === "answer_one_sentence")?.body ?? "";

  const result = await runAgent({
    agent: "coach",
    feature: "working_doc_coherence",
    tier: "strong",
    system: [
      "You are Cruxy reviewing an Ethics Bowl working document for coherence.",
      "Find missing perspectives, missing stakeholders, claims that do not connect to the one-sentence answer, and loose ends.",
      "Each finding becomes a short suggestion the team can tick or cross.",
      "Do not invent case facts. Plain words. No em dashes. No team names.",
      "Output JSON only.",
    ].join(" "),
    user: `One-sentence answer:\n${answer || "(empty)"}\n\nFull document:\n${filled}`,
    schema: findingSchema,
    personId: opts.personId,
    fixtureKey: "working_doc_coherence",
    estimatedCostUsd: 0.03,
    stubFallback: () => stubFindings(filled),
  });

  const findings = result.ok ? result.data.findings : stubFindings(filled).findings;
  const texts: string[] = [];

  for (const f of findings) {
    const sectionKey = (f.section_key ?? null) as WorkingSectionKey | null;
    const sug = await insertSuggestion({
      case_id: opts.caseId,
      team_id: opts.teamId,
      brief_id: brief.id,
      kind: f.kind,
      text: f.text.replace(/[·—–]/g, ","),
      citation: null,
      paragraph_anchor: null,
      section_key: sectionKey,
      source: "cruxy",
      truth_item_id: null,
      created_by: opts.personId,
    });
    texts.push(sug.text);
  }

  await logActivity({
    person_id: opts.personId,
    action: "working_doc_coherence_check",
    target: brief.id,
    meta: { added: texts.length, caseId: opts.caseId },
  });

  return { added: texts.length, texts };
}
