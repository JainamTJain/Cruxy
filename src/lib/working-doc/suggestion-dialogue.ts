/**
 * The back and forth on one suggestion.
 *
 * @Cruxy in a reply: Cruxy reads the suggestion, the team's document and the
 * whole thread, then pushes on the weakest step: why, why, so what. It names
 * the gap, offers a counterexample, and ends with one question.
 *
 * Redraft: Cruxy rewrites the suggestion using everything said in the thread,
 * including a half formed idea or a change of style, at any point.
 */
import "server-only";
import { z } from "zod";
import { runAgent } from "@/lib/cruxy/agents/runAgent";
import { sharedSystemPrefix } from "@/lib/cruxy/prompts/shared";
import { listCases, logActivity } from "@/lib/db/repository";
import {
  WORKING_SECTION_KEYS,
  WORKING_SECTION_LABELS,
  getSuggestionById,
  listWorkingSections,
  updateSuggestionDraft,
  type WorkingSectionKey,
} from "@/lib/db/supabase/working-doc-extra";
import { ensureTeamBrief } from "@/lib/case-brain/team-brief";
import { addCruxyReply, ensureThread, listReplies } from "@/lib/discussion/repository";

const clip = (n: number) =>
  z.preprocess((v) => (typeof v === "string" ? v.replace(/[·—–]/g, ",").trim().slice(0, n) : v), z.string());

async function context(opts: { suggestionId: string; teamId: string; caseId: string; personId: string }) {
  const s = await getSuggestionById(opts.suggestionId);
  if (!s || s.team_id !== opts.teamId || s.case_id !== opts.caseId) throw new Error("Suggestion not found.");
  const [cases, brief] = await Promise.all([
    listCases(),
    ensureTeamBrief({ teamId: opts.teamId, caseId: opts.caseId, personId: opts.personId }),
  ]);
  const c = cases.find((x) => x.id === opts.caseId);
  const sections = await listWorkingSections(brief.id).catch(() => []);
  const doc = WORKING_SECTION_KEYS.map((k) => {
    const body = sections.find((x) => x.section_key === k)?.body?.trim();
    return `${WORKING_SECTION_LABELS[k]} [${k}]:\n${body ? body.slice(0, 1400) : "(empty)"}`;
  }).join("\n\n");
  const thread = await ensureThread({
    teamId: opts.teamId,
    caseId: opts.caseId,
    kind: "suggestion",
    targetId: s.id,
    title: (s.stronger_version ?? s.text).slice(0, 80),
    personId: opts.personId,
  });
  const replies = await listReplies(thread.id);
  const transcript = replies
    .slice(-16)
    .map((r) => `${r.author === "cruxy" ? "Cruxy" : r.person_name?.split(" ")[0] ?? "Teammate"}: ${r.body}`)
    .join("\n");
  const section = (s.section_key as WorkingSectionKey | null) ?? null;
  const suggestion = [
    `Section: ${section ? WORKING_SECTION_LABELS[section] : "not set"}`,
    `What it says is wrong or missing: ${s.weak_spot ?? s.text}`,
    s.logic_chain ? `The chain as Cruxy rebuilt it: ${s.logic_chain}` : "",
    s.why_weak ? `Why it matters: ${s.why_weak}` : "",
    s.stronger_version ? `Current draft:\n${s.stronger_version}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return { s, c, doc, thread, replies, transcript, suggestion, section };
}

const DEPTH = [
  "Depth standard. Never stop at the surface. For every claim, run the ladder:",
  "1. Why is it true? (the reason, from the case facts or a source)",
  "2. Why does that reason hold? (the principle or value underneath it)",
  "3. So what? (what follows for this case's question, and for whom)",
  "4. Why does it survive the best objection? (the strongest counter, answered)",
  "A step that only restates the one before it does not count. Name the value or principle, tie it to specific facts of this case, and say what would change your mind.",
].join("\n");

const challengeSchema = z.object({ reply: clip(1500) });

/** @Cruxy in a suggestion thread: push on the weakest step and ask one question. */
export async function cruxyChallenge(opts: {
  suggestionId: string;
  teamId: string;
  caseId: string;
  personId: string;
}): Promise<string> {
  const ctx = await context(opts);
  const res = await runAgent({
    agent: "coach",
    feature: "suggestion_challenge",
    tier: "strong",
    system: [
      sharedSystemPrefix(),
      "",
      "Task: you are Cruxy, sparring with an Ethics Bowl team in the reply thread under one suggestion for their working document. Someone just called you in with @Cruxy. Read the latest message closely and answer that person.",
      DEPTH,
      "How to reply:",
      "- Find the weakest step in their reasoning (in the draft, or in what they just wrote) and push on it with why or so what. Quote their words briefly when you do.",
      "- Name the gap plainly: the missing premise, the unsupported jump, the objection left unanswered, or the value they assume without saying.",
      "- Offer one concrete counterexample or the strongest objection a judge or the other team would raise.",
      "- If they offered a new or half formed idea, take it one step further and test it; say what it would need to hold.",
      "- If they asked for a change in style or wording, say briefly how you would change the draft and that Redraft will apply it.",
      "- End with exactly one sharp question that moves the chain one rung deeper.",
      "Keep it to 4 to 7 short sentences. Do not praise. Do not lecture. Plain words. No em dashes. Never name another team.",
      'Return JSON only: {"reply":"..."}',
    ].join("\n"),
    user: [
      `Case ${ctx.c?.number ?? ""}: ${ctx.c?.title ?? ""}`,
      ctx.c?.crux ? `Crux: ${ctx.c.crux}` : "",
      "",
      "The suggestion:",
      ctx.suggestion,
      "",
      "Their working document:",
      ctx.doc,
      "",
      "The thread so far (latest last):",
      ctx.transcript || "(empty)",
    ]
      .filter(Boolean)
      .join("\n"),
    schema: challengeSchema,
    personId: opts.personId,
    estimatedCostUsd: 0.05,
  });
  const reply =
    res.ok && !res.stub
      ? res.data.reply
      : "I could not think this through just now. Ask me again in a moment.";
  await addCruxyReply({ threadId: ctx.thread.id, body: reply });
  return reply;
}

const redraftSchema = z.object({
  draft: clip(2000).pipe(z.string().min(20)),
  ladder: z.array(clip(400)).max(6).catch([]),
  question_back: clip(300).catch(""),
  changed: clip(400).catch(""),
});

/** Rewrite the suggestion from the thread, at any point in the conversation. */
export async function redraftSuggestion(opts: {
  suggestionId: string;
  teamId: string;
  caseId: string;
  personId: string;
}): Promise<{ draft: string; changed: string }> {
  const ctx = await context(opts);
  const res = await runAgent({
    agent: "coach",
    feature: "suggestion_redraft",
    tier: "strong",
    system: [
      sharedSystemPrefix(),
      "",
      "Task: redraft one suggestion for an Ethics Bowl team's working document, using everything in the reply thread.",
      DEPTH,
      "Rules:",
      "- Fold in what the team said in the thread: a new idea (developed, not pasted), a correction, a value they care about, a requested change of style, length or structure. A style request from the team wins over your default.",
      "- Answer the questions Cruxy raised in the thread inside the draft where the team gave you enough to do so.",
      "- Write the draft exactly as it should sit in the section, in the team's voice and the section's structure (Claim N:, Logic line:, S1., Q:, A:). Make every step of the ladder visible in the text: the reason, the principle under it, the so what for this case, and the answer to the best objection.",
      "- Use only facts from the case, the document or the thread. Never invent a source, quote or number.",
      "ladder: the 3 to 5 rungs of the reasoning in the draft, one line each (Why, Why that holds, So what, Against the best objection).",
      "question_back: the next question the team should answer to take it deeper, ending with What do you think?",
      "changed: one sentence on what changed from the current draft and why.",
      "Plain words. No em dashes. Never name another team.",
      'Return JSON only: {"draft","ladder":[],"question_back","changed"}',
    ].join("\n"),
    user: [
      `Case ${ctx.c?.number ?? ""}: ${ctx.c?.title ?? ""}`,
      ctx.c?.crux ? `Crux: ${ctx.c.crux}` : "",
      "",
      "The suggestion:",
      ctx.suggestion,
      "",
      "Their working document:",
      ctx.doc,
      "",
      "The thread (latest last):",
      ctx.transcript || "(empty: redraft deeper on your own)",
    ]
      .filter(Boolean)
      .join("\n"),
    schema: redraftSchema,
    personId: opts.personId,
    estimatedCostUsd: 0.08,
  });
  if (!res.ok || res.stub) throw new Error("Cruxy could not redraft this just now. Try again.");
  const d = res.data;
  const ladder = d.ladder.length ? `\n${d.ladder.map((l) => `- ${l}`).join("\n")}` : "";
  await updateSuggestionDraft(ctx.s.id, {
    stronger_version: d.draft,
    why_weak: `${ctx.s.why_weak?.split("\nThe reasoning:")[0] ?? ""}\nThe reasoning:${ladder}`.trim(),
    question_back: d.question_back || ctx.s.question_back,
  });
  await addCruxyReply({
    threadId: ctx.thread.id,
    body: `Redrafted. ${d.changed || "The draft now spells out the reasoning step by step."}${d.question_back ? ` Next: ${d.question_back}` : ""}`,
  });
  await logActivity({
    person_id: opts.personId,
    action: "working_doc_suggestion_redrafted",
    target: ctx.s.id,
    meta: { caseId: opts.caseId, teamId: opts.teamId, replies: ctx.replies.length },
  });
  return { draft: d.draft, changed: d.changed };
}
