import { NextResponse, after } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canSeeAllTeams } from "@/lib/auth/team-privacy";
import { getPersonById, listTeams } from "@/lib/db/repository";
import { WORKING_SECTION_KEYS, type WorkingSectionKey } from "@/lib/db/supabase/working-doc-extra";
import {
  addCoachComment,
  compareStances,
  getCaseOverview,
  notifyTeamsOfQuestions,
  notifyTeamsOfReading,
} from "@/lib/coach/case-overview";
import { confirmModeratorQuestions, listQuestions, pasteModeratorQuestions } from "@/lib/revision/repository";
import { disseminateReading } from "@/lib/reading/import-reading";

export const runtime = "nodejs";
export const maxDuration = 180;

async function requireCoach() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };
  const person = await getPersonById(session.personId);
  if (!person || !canSeeAllTeams(person, session)) {
    return { error: NextResponse.json({ error: "Only Dr. B and the tech admin, in admin view, can open this." }, { status: 403 }) };
  }
  return { session, person };
}

/** Every team's stance on one case, Dr. B's comments, and the case's moderator questions. */
export async function GET(req: Request) {
  const auth = await requireCoach();
  if ("error" in auth) return auth.error;
  const caseId = new URL(req.url).searchParams.get("caseId");
  if (!caseId) return NextResponse.json({ error: "caseId required" }, { status: 400 });
  try {
    const [overview, questions] = await Promise.all([
      getCaseOverview(caseId),
      listQuestions({ caseId }).catch(() => []),
    ]);
    return NextResponse.json({
      overview,
      questions: questions
        .filter((q) => q.status !== "rejected")
        .map((q) => ({ id: q.id, text: q.text, status: q.status, origin: q.origin, origin_label: q.origin_label ?? null })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not load the case." }, { status: 400 });
  }
}

export async function POST(req: Request) {
  const auth = await requireCoach();
  if ("error" in auth) return auth.error;
  const { person } = auth;
  const name = person.name ?? "Dr. B";

  // Sharing a reading comes as a form (a file may be attached).
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData();
    const caseId = String(form.get("caseId") ?? "");
    const all = (await listTeams()).map((t) => t.id);
    const picked = String(form.get("teamIds") ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter((x) => all.includes(x));
    const teamIds = picked.length ? picked : all;
    const file = form.get("file");
    try {
      const result = await disseminateReading({
        caseId,
        teamIds,
        personId: person.id,
        title: (form.get("title") as string | null) ?? null,
        note: (form.get("note") as string | null) ?? null,
        text: (form.get("text") as string | null) ?? null,
        url: ((form.get("url") as string | null) ?? "").trim() || null,
        file:
          file instanceof File && file.size > 0
            ? { name: file.name, type: file.type || "", bytes: new Uint8Array(await file.arrayBuffer()) }
            : null,
      });
      after(async () => {
        await notifyTeamsOfReading({
          caseId,
          teamIds,
          personId: person.id,
          personName: name,
          title: (form.get("title") as string | null) || "A new reading for this case",
        });
        const { scheduleCritiqueOnChange } = await import("@/lib/critique/run");
        for (const teamId of teamIds) {
          await scheduleCritiqueOnChange({ caseId, teamId, personId: person.id, delayMs: 0 }).catch(() => undefined);
        }
      });
      return NextResponse.json({ ok: true, shared: result.length, result });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Could not share that reading." }, { status: 400 });
    }
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: "comment" | "compare" | "questions";
    caseId?: string;
    teamIds?: string[];
    sectionKey?: string | null;
    quote?: string | null;
    comment?: string;
    suggested?: string | null;
    raw?: string;
  };
  if (!body.caseId) return NextResponse.json({ error: "caseId required" }, { status: 400 });
  const caseId = body.caseId;
  try {
    if (body.action === "comment") {
      const all = (await listTeams()).map((t) => t.id);
      const teamIds = (body.teamIds ?? []).filter((t) => all.includes(t));
      if (!teamIds.length) return NextResponse.json({ error: "Pick a team." }, { status: 400 });
      const sectionKey = WORKING_SECTION_KEYS.includes(body.sectionKey as WorkingSectionKey)
        ? (body.sectionKey as WorkingSectionKey)
        : null;
      for (const teamId of teamIds) {
        await addCoachComment({
          caseId,
          teamId,
          personId: person.id,
          personName: name,
          sectionKey,
          quote: body.quote ?? null,
          comment: body.comment ?? "",
          suggested: body.suggested ?? null,
        });
      }
      return NextResponse.json({ ok: true, overview: await getCaseOverview(caseId) });
    }
    if (body.action === "compare") {
      const comparison = await compareStances({ caseId, personId: person.id });
      if (!comparison) {
        return NextResponse.json({ error: "No team has a working document on this case yet, or Cruxy could not compare them just now." }, { status: 400 });
      }
      return NextResponse.json({ comparison });
    }
    if (body.action === "questions") {
      const raw = (body.raw ?? "").trim();
      if (raw.length < 8) return NextResponse.json({ error: "Write at least one question." }, { status: 400 });
      const created = await pasteModeratorQuestions({ raw, caseId, personId: person.id, origin: "dr_b" });
      // Dr. B's own questions go live for every team right away.
      await confirmModeratorQuestions({ questionIds: created.map((q) => q.id), personId: person.id });
      after(() =>
        notifyTeamsOfQuestions({ caseId, count: created.length, personId: person.id, personName: name }).catch(() => undefined),
      );
      return NextResponse.json({ ok: true, added: created.length });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save." }, { status: 400 });
  }
}
