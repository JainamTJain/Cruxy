import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore } from "@/lib/db/sample-store";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import { getRoundById } from "@/lib/db/practice-repository";
import { rerunGlossaryTestClip } from "@/lib/practice/glossary-extra";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "tech_admin" && !session.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: roundId } = await ctx.params;
  const round = await getRoundById(roundId);
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  if (isSampleDataMode()) {
    const store = await readStore();
    const check = (
      store as unknown as {
        glossary_round_checks?: {
          round_id: string;
          accuracy: number;
          uncertain_count: number;
          correction_count: number;
          term_hits: { term: string; hit: boolean }[];
          checked_at: string;
        }[];
      }
    ).glossary_round_checks?.find((c) => c.round_id === roundId);
    const clip = round.case_id
      ? (
          store as unknown as {
            glossary_test_clips?: {
              case_id: string;
              needs_rerun: boolean;
              last_accuracy?: number;
            }[];
          }
        ).glossary_test_clips?.find((c) => c.case_id === round.case_id)
      : null;
    return NextResponse.json({ check: check ?? null, testClip: clip ?? null });
  }

  const sb = getServiceSupabase();
  const { data: check } = await sb
    .from("glossary_round_checks")
    .select("*")
    .eq("round_id", roundId)
    .maybeSingle();
  let testClip = null;
  if (round.case_id) {
    const { data } = await sb
      .from("glossary_test_clips")
      .select("*")
      .eq("case_id", round.case_id)
      .maybeSingle();
    testClip = data;
  }
  return NextResponse.json({ check, testClip });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "tech_admin" && !session.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id: roundId } = await ctx.params;
  const round = await getRoundById(roundId);
  if (!round?.case_id) {
    return NextResponse.json({ error: "Round or case not found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    transcriptText?: string;
  };
  const result = await rerunGlossaryTestClip({
    caseId: round.case_id,
    transcriptText: body.transcriptText,
    personId: session.personId,
  });
  return NextResponse.json({ ok: true, ...result });
}
