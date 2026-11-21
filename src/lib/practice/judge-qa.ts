/**
 * F-251: In Cruxy judge mode, ask judges' Q&A out loud:
 * one question and one follow-up per judge seat.
 */
import { callCruxy } from "@/lib/cruxy/callCruxy";
import { getJudgeGroundingPack } from "@/lib/practice/judge-grounding";
import {
  listCruxyJudgeQa,
  upsertCruxyJudgeQa,
  type CruxyJudgeQaRow,
} from "@/lib/db/supabase/judge-card-extra";

const DEFAULT_SEATS = 3;

export async function ensureCruxyJudgeQa(opts: {
  roundId: string;
  caseTitle?: string | null;
  caseNumber?: number | null;
  seatCount?: number;
  personId?: string | null;
}): Promise<CruxyJudgeQaRow[]> {
  const seats = Math.min(6, Math.max(1, opts.seatCount ?? DEFAULT_SEATS));
  const existing = await listCruxyJudgeQa(opts.roundId);
  if (existing.length >= seats) return existing.slice(0, seats);

  const grounding = await getJudgeGroundingPack();
  const generated = await generateSeats({
    seats,
    caseTitle: opts.caseTitle ?? "this case",
    caseNumber: opts.caseNumber ?? null,
    grounding: grounding.text,
    personId: opts.personId,
  });

  const saved: CruxyJudgeQaRow[] = [];
  for (const g of generated) {
    saved.push(
      await upsertCruxyJudgeQa({
        round_id: opts.roundId,
        seat_index: g.seat_index,
        question: g.question,
        follow_up: g.follow_up,
        created_by: opts.personId ?? null,
      }),
    );
  }
  return saved;
}

async function generateSeats(opts: {
  seats: number;
  caseTitle: string;
  caseNumber: number | null;
  grounding: string;
  personId?: string | null;
}): Promise<
  { seat_index: number; question: string; follow_up: string }[]
> {
  const fallback = fallbackSeats(opts.seats, opts.caseTitle);

  const result = await callCruxy({
    feature: "cruxy_judge_qa",
    tier: "small",
    personId: opts.personId,
    estimatedCostUsd: 0.05,
    messages: [
      {
        role: "system",
        content: [
          "You write Ethics Bowl judges' Q&A for practice.",
          "Return JSON only: {\"seats\":[{\"seat_index\":1,\"question\":\"...\",\"follow_up\":\"...\"}]}",
          "One question and one follow-up per seat. Plain words. No middle dots. No em dashes.",
          "Ground questions in the Guide to Scoring and judges' Q&A rules.",
          opts.grounding.slice(0, 6000),
        ].join("\n"),
      },
      {
        role: "user",
        content: `Case ${opts.caseNumber ?? ""} ${opts.caseTitle}. Write ${opts.seats} judge seats.`,
      },
    ],
  });

  if (!result.ok || result.stub) return fallback;

  try {
    const parsed = JSON.parse(result.text) as {
      seats?: { seat_index?: number; question?: string; follow_up?: string }[];
    };
    const seats = (parsed.seats ?? [])
      .map((s, i) => ({
        seat_index: Number(s.seat_index) || i + 1,
        question: clean(s.question) || fallback[i]?.question || "What is your view?",
        follow_up:
          clean(s.follow_up) ||
          fallback[i]?.follow_up ||
          "What would the other side say?",
      }))
      .slice(0, opts.seats);
    return seats.length ? seats : fallback;
  } catch {
    return fallback;
  }
}

function clean(s: string | undefined): string {
  return (s ?? "")
    .replace(/·/g, ",")
    .replace(/\u2014|\u2013/g, "-")
    .trim();
}

function fallbackSeats(
  seats: number,
  caseTitle: string,
): { seat_index: number; question: string; follow_up: string }[] {
  const bank = [
    {
      question: `What is your view on ${caseTitle}, and what are your main reasons?`,
      follow_up: "Which stakeholder did you leave out, and why does that matter?",
    },
    {
      question:
        "Where would someone who disagrees press hardest on your claim?",
      follow_up: "How do you answer that without talking past them?",
    },
    {
      question:
        "If one fact in the case changed, would your conclusion flip? Which fact?",
      follow_up: "Why does your principle still hold after that change?",
    },
  ];
  return Array.from({ length: seats }, (_, i) => ({
    seat_index: i + 1,
    question: bank[i % bank.length]!.question,
    follow_up: bank[i % bank.length]!.follow_up,
  }));
}
