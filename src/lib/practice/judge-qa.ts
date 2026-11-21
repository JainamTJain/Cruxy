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

  // Real data only: if Cruxy did not return seats, leave empty (no invented Q&A).
  if (!generated.length) return existing;

  const saved: CruxyJudgeQaRow[] = [...existing];
  for (const g of generated) {
    if (saved.some((s) => s.seat_index === g.seat_index)) continue;
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
  return saved.sort((a, b) => a.seat_index - b.seat_index);
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

  if (!result.ok || result.stub) return [];

  try {
    const parsed = JSON.parse(result.text) as {
      seats?: { seat_index?: number; question?: string; follow_up?: string }[];
    };
    return (parsed.seats ?? [])
      .map((s, i) => ({
        seat_index: Number(s.seat_index) || i + 1,
        question: clean(s.question),
        follow_up: clean(s.follow_up),
      }))
      .filter((s) => s.question && s.follow_up)
      .slice(0, opts.seats);
  } catch {
    return [];
  }
}

function clean(s: string | undefined): string {
  return (s ?? "")
    .replace(/·/g, ",")
    .replace(/\u2014|\u2013/g, "-")
    .trim();
}
