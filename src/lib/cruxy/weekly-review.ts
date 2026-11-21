
import { randomUUID } from "crypto";
import { callCruxy } from "@/lib/cruxy/callCruxy";
import { recentCruxyFeedback, saveWorkedExample } from "@/lib/cruxy/examples";
import { isSampleDataMode } from "@/lib/db/config";
import { logActivity } from "@/lib/db/repository";
import {
  insertWeeklyReviewDraft,
  listWeeklyReviewDrafts,
  updateWeeklyReviewDraftStatus,
  type WeeklyReviewDraftRow,
} from "@/lib/db/supabase/cruxy-extra";
import { sharedSystemPrefix } from "@/lib/cruxy/prompts/shared";

const sampleDrafts: WeeklyReviewDraftRow[] = [];

function mondayOf(d = new Date()): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setUTCDate(x.getUTCDate() + diff);
  return x.toISOString().slice(0, 10);
}

/**
 * Draft weekly updates to examples and checks from the week's feedback.
 * Technical admin approves in the console.
 */
export async function draftWeeklyReview(opts?: {
  personId?: string | null;
}): Promise<WeeklyReviewDraftRow> {
  const weekStart = mondayOf();
  const feedback = await recentCruxyFeedback({ sinceDays: 7, limit: 100 });
  const { summarizeSocraticOutcomesForWeek } = await import(
    "@/lib/cruxy/socratic-outcomes"
  );
  const socraticWeek = await summarizeSocraticOutcomesForWeek({
    sinceDays: 7,
  }).catch(() => ({
    sampleSize: 0,
    improved: 0,
    liftRate: null as number | null,
    byAttempt: { drill: 0, flashcard: 0, round: 0 },
    lines: [
      "Socratic outcomes: none yet this week. They appear after a finished drill and a later attempt on the same case.",
    ],
  }));

  const useful = feedback.filter((f) => f.verdict === "useful").length;
  const notUseful = feedback.filter((f) => f.verdict === "not_useful").length;
  const wrong = feedback.filter((f) => f.verdict === "wrong").length;

  const summaryLines = [
    `Week of ${weekStart}`,
    `Feedback: ${useful} useful, ${notUseful} not useful, ${wrong} marked wrong.`,
    ...socraticWeek.lines,
    ...feedback.slice(0, 12).map(
      (f) =>
        `- [${f.verdict}] ${f.agent}/${f.feature}${f.reason ? `: ${f.reason.slice(0, 80)}` : ""}`,
    ),
  ];

  const result = await callCruxy({
    feature: "weekly_review_draft",
    tier: "small",
    personId: opts?.personId ?? null,
    estimatedCostUsd: 0.02,
    messages: [
      { role: "system", content: sharedSystemPrefix() },
      {
        role: "system",
        content:
          "You draft a weekly review of Cruxy's examples and checks for the technical admin. Propose which useful outputs to keep as worked examples and which weak patterns to store with what went wrong. Keep it short. Return plain text, not JSON.",
      },
      {
        role: "user",
        content: summaryLines.join("\n"),
      },
    ],
  });

  const draftBody =
    result.ok && !result.stub
      ? `${result.text}\n\n${socraticWeek.lines.join("\n")}`
      : [
          `Weekly Cruxy review (${weekStart})`,
          "",
          `Useful ${useful}, not useful ${notUseful}, wrong ${wrong}.`,
          "",
          ...socraticWeek.lines,
          "",
          "Proposed actions:",
          "- Keep high-scoring redo critiques as strong examples.",
          "- Store outputs marked wrong with the reason as weak examples.",
          "- Re-run tests/cruxy before shipping any prompt change.",
          "",
          "Awaiting technical admin approval.",
        ].join("\n");

  const proposedExampleIds: string[] = [];
  for (const f of feedback.filter((x) => x.verdict === "useful").slice(0, 3)) {
    const ex = await saveWorkedExample({
      kind: "strong",
      agent: f.agent,
      caseId: f.case_id,
      title: `Useful ${f.agent} output`,
      body: f.reason ?? f.output_ref ?? "Marked useful this week.",
      personId: opts?.personId,
      approved: false,
      sourceRef: f.id,
    });
    proposedExampleIds.push(ex.id);
  }
  for (const f of feedback.filter((x) => x.verdict === "wrong").slice(0, 3)) {
    const ex = await saveWorkedExample({
      kind: "weak",
      agent: f.agent,
      caseId: f.case_id,
      title: `Marked wrong: ${f.agent}`,
      body: f.output_ref ?? "Cruxy point marked wrong.",
      whatWentWrong: f.reason ?? "Lead or admin marked this wrong.",
      personId: opts?.personId,
      approved: false,
      sourceRef: f.id,
    });
    proposedExampleIds.push(ex.id);
  }

  const row: WeeklyReviewDraftRow = {
    id: randomUUID(),
    week_start: weekStart,
    draft_body: draftBody,
    proposed_example_ids: proposedExampleIds,
    proposed_check_updates: [
      {
        check: "fixed_test_set",
        note: "Re-run npm run test:cruxy; ship only if score is same or higher.",
      },
      {
        kind: "socratic_outcomes",
        text: socraticWeek.lines[0] ?? "No Socratic outcomes this week.",
      },
    ],
    status: "pending",
    created_at: new Date().toISOString(),
    created_by: opts?.personId ?? null,
    reviewed_at: null,
    reviewed_by: null,
    review_note: null,
  };

  if (isSampleDataMode()) {
    sampleDrafts.unshift(row);
  } else {
    await insertWeeklyReviewDraft(row);
  }

  await logActivity({
    person_id: opts?.personId ?? null,
    action: "weekly_review_drafted",
    target: row.id,
    meta: { week_start: weekStart, examples: proposedExampleIds.length },
  });

  return row;
}

export async function approveWeeklyReview(input: {
  id: string;
  reviewedBy: string;
  approve: boolean;
  note?: string | null;
}): Promise<WeeklyReviewDraftRow> {
  if (isSampleDataMode()) {
    const row = sampleDrafts.find((d) => d.id === input.id);
    if (!row) throw new Error("Weekly review draft not found.");
    row.status = input.approve ? "approved" : "rejected";
    row.reviewed_at = new Date().toISOString();
    row.reviewed_by = input.reviewedBy;
    row.review_note = input.note ?? null;
    await logActivity({
      person_id: input.reviewedBy,
      action: input.approve
        ? "weekly_review_approved"
        : "weekly_review_rejected",
      target: row.id,
      meta: {},
    });
    return row;
  }

  const updated = await updateWeeklyReviewDraftStatus({
    id: input.id,
    status: input.approve ? "approved" : "rejected",
    reviewedBy: input.reviewedBy,
    reviewNote: input.note,
  });
  await logActivity({
    person_id: input.reviewedBy,
    action: input.approve
      ? "weekly_review_approved"
      : "weekly_review_rejected",
    target: updated.id,
    meta: {},
  });
  return updated;
}

export async function listPendingWeeklyReviews(): Promise<
  WeeklyReviewDraftRow[]
> {
  if (isSampleDataMode()) {
    return sampleDrafts.filter((d) => d.status === "pending");
  }
  return listWeeklyReviewDrafts({ status: "pending" });
}
