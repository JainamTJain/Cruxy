import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listCases, getPersonById } from "@/lib/db/repository";
import { getRoundById } from "@/lib/db/practice-repository";
import { ensureCruxyJudgeQa } from "@/lib/practice/judge-qa";
import { listCruxyJudgeQa } from "@/lib/db/supabase/judge-card-extra";

type Params = { params: Promise<{ id: string }> };

/** F-251: Cruxy judge Q&A seats (question + follow-up). */
export async function GET(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id: roundId } = await params;
  const round = await getRoundById(roundId);
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  const cases = await listCases();
  const caseRow = cases.find((c) => c.id === round.case_id) ?? null;
  const seats = await ensureCruxyJudgeQa({
    roundId,
    caseTitle: caseRow?.title ?? null,
    caseNumber: caseRow?.number ?? null,
    personId: session.personId,
  });

  return NextResponse.json({
    seats: seats.map((s) => ({
      seat: s.seat_index,
      question: s.question,
      followUp: s.follow_up,
    })),
    empty: seats.length === 0,
  });
}

export async function POST(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person || (person.role !== "tech_admin" && person.role !== "coach_admin")) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }
  const { id: roundId } = await params;
  const body = (await req.json().catch(() => ({}))) as { seats?: number };
  const round = await getRoundById(roundId);
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }
  const cases = await listCases();
  const caseRow = cases.find((c) => c.id === round.case_id) ?? null;
  // Force regenerate by writing over seats
  const existing = await listCruxyJudgeQa(roundId);
  void existing;
  const seats = await ensureCruxyJudgeQa({
    roundId,
    caseTitle: caseRow?.title ?? null,
    caseNumber: caseRow?.number ?? null,
    seatCount: body.seats ?? 3,
    personId: session.personId,
  });
  return NextResponse.json({ seats });
}
