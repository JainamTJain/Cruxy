import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById, listCases } from "@/lib/db/repository";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore } from "@/lib/db/sample-store";
import { assertOk, getServiceSupabase } from "@/lib/db/supabase/client";
import { latestOnePager, listQuestions } from "@/lib/revision/repository";
import {
  answerSoloQaItem,
  getSoloQaSession,
  listActiveSoloQa,
  startSoloQaSession,
  type SoloQaKind,
} from "@/lib/db/supabase/practice-study-extra";

export const runtime = "nodejs";

async function leadCaseIdsFor(personId: string): Promise<string[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return store.case_roles
      .filter(
        (r) =>
          r.person_id === personId &&
          (r.role === "lead_1" || r.role === "lead_2"),
      )
      .map((r) => r.case_id);
  }
  const { data, error } = await getServiceSupabase()
    .from("case_roles")
    .select("case_id,role")
    .eq("person_id", personId)
    .in("role", ["lead_1", "lead_2"]);
  assertOk(error, "leadCaseIdsFor");
  return (data ?? []).map((r) => r.case_id as string);
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (id) {
    const row = await getSoloQaSession(id);
    if (!row || row.person_id !== session.personId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ session: row });
  }
  const active = await listActiveSoloQa(session.personId);
  const person = await getPersonById(session.personId);
  const cases = (await listCases()).filter((c) => c.active);
  const leadCaseIds = await leadCaseIdsFor(session.personId);
  return NextResponse.json({
    active,
    teamId: person?.team_id ?? session.teamId,
    cases,
    leadCaseIds,
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  const body = (await req.json()) as {
    action?: string;
    caseId?: string;
    teamId?: string;
    kind?: SoloQaKind;
    sessionId?: string;
    answer?: string;
  };

  if (body.action === "start") {
    if (!body.caseId || !body.teamId || !body.kind) {
      return NextResponse.json(
        { error: "caseId, teamId and kind required" },
        { status: 400 },
      );
    }
    if (body.kind !== "moderator" && body.kind !== "judges") {
      return NextResponse.json({ error: "kind must be moderator or judges" }, { status: 400 });
    }

    const bank = await listQuestions({
      caseId: body.caseId,
      status: "active",
    });
    // Judge-like types first for judges kind; otherwise prefer the rest.
    const judgeTypes = new Set([
      "follow_up",
      "pushback",
      "change_facts",
      "other_team",
    ]);
    const filtered =
      body.kind === "judges"
        ? bank.filter((q) => judgeTypes.has(q.type))
        : bank.filter((q) => !judgeTypes.has(q.type));
    const pool = filtered.length ? filtered : bank;
    const prompts: { questionId: string | null; prompt: string }[] = pool
      .slice(0, 5)
      .map((q) => ({
        questionId: q.id,
        prompt: q.text,
      }));

    if (prompts.length === 0) {
      // Fallback prompts so practice always starts.
      prompts.push(
        {
          questionId: null,
          prompt:
            body.kind === "judges"
              ? "What is the strongest objection to your position, and how do you answer it?"
              : "In one sentence, what should we conclude about this case, and why?",
        },
        {
          questionId: null,
          prompt:
            body.kind === "judges"
              ? "Change the facts slightly. Does your answer still hold?"
              : "Name one stakeholder your answer may overlook, and how you still stand by it.",
        },
        {
          questionId: null,
          prompt:
            "Concede the fairest point against you, then distinguish or rebut.",
        },
      );
    }

    const row = await startSoloQaSession({
      personId: session.personId,
      teamId: body.teamId,
      caseId: body.caseId,
      kind: body.kind,
      prompts,
    });
    return NextResponse.json({ session: row });
  }

  if (body.action === "answer") {
    if (!body.sessionId || !body.answer?.trim()) {
      return NextResponse.json(
        { error: "sessionId and answer required" },
        { status: 400 },
      );
    }
    const existing = await getSoloQaSession(body.sessionId);
    if (!existing || existing.person_id !== session.personId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const page = await latestOnePager(existing.team_id, existing.case_id);
    const hint = page
      ? [
          page.body.language?.plain,
          ...page.body.claims.map((c) => c.text),
          page.body.counterclaim?.text,
        ]
          .filter(Boolean)
          .join("\n")
      : null;
    const row = await answerSoloQaItem({
      sessionId: body.sessionId,
      personId: session.personId,
      answer: body.answer.trim(),
      onePagerHint: hint,
    });
    return NextResponse.json({ session: row });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
