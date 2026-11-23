import { NextResponse } from "next/server";
import { requireMemberSession } from "@/lib/case-brain/auth";
import { listPeopleFull } from "@/lib/db/repository";
import {
  addAnnotation,
  deleteAnnotation,
  listAnnotations,
  loadReading,
  type ReadingKind,
} from "@/lib/reading/reading-room";

export const runtime = "nodejs";
// The note pass (weigh, research, draft) runs after the response.
export const maxDuration = 300;

async function withNames(teamId: string, caseId: string, kind: ReadingKind, id: string) {
  const [anns, people] = await Promise.all([
    listAnnotations({ teamId, caseId, kind, readingId: id }),
    listPeopleFull(),
  ]);
  const { listNoteStatuses } = await import("@/lib/reading/note-to-suggestion");
  const statuses = await listNoteStatuses({ teamId, caseId, sourceIds: anns.map((a) => a.id) }).catch(() => []);
  return anns.map((a) => {
    const st = statuses.find((x) => x.source_kind === "annotation" && x.source_id === a.id);
    return {
      ...a,
      person_name: people.find((p) => p.id === a.person_id)?.name?.split(" ")[0] ?? null,
      cruxy: st ? { status: st.status, reason: st.reason, suggestion_id: st.suggestion_id } : null,
    };
  });
}

function parseKind(k: string | null): ReadingKind | null {
  return k === "web" || k === "import" || k === "case" ? k : null;
}

/** Open a reading in the reading room, with this team's notes on it. */
export async function GET(req: Request) {
  const auth = await requireMemberSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const u = new URL(req.url);
  const caseId = u.searchParams.get("caseId");
  const id = u.searchParams.get("id");
  const kind = parseKind(u.searchParams.get("kind"));
  if (!caseId || !id || !kind) return NextResponse.json({ error: "caseId, kind and id required" }, { status: 400 });
  const reading = await loadReading({ kind, id, caseId, teamId: auth.teamId, personId: auth.session.personId });
  if (!reading) return NextResponse.json({ error: "That reading is not available to your team." }, { status: 404 });
  const annotations = await withNames(auth.teamId, caseId, kind, id);
  return NextResponse.json({ reading, annotations });
}

/** Add or remove a highlight, comment or sticky note. */
export async function POST(req: Request) {
  const auth = await requireMemberSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await req.json().catch(() => ({}))) as {
    action?: "add" | "delete" | "consider";
    caseId?: string;
    kind?: string;
    id?: string;
    annotationKind?: "highlight" | "comment" | "note";
    quote?: string | null;
    body?: string | null;
    passageOrd?: number | null;
    annotationId?: string;
  };
  const kind = parseKind(body.kind ?? null);
  if (!body.caseId || !body.id || !kind) {
    return NextResponse.json({ error: "caseId, kind and id required" }, { status: 400 });
  }
  try {
    if (body.action === "consider") {
      // "Draft it anyway": the team decides a note is worth developing.
      if (!body.annotationId) return NextResponse.json({ error: "Missing note." }, { status: 400 });
      const { considerAnnotation } = await import("@/lib/reading/reading-room");
      const annotationId = body.annotationId;
      const { markNoteThinking } = await import("@/lib/reading/note-to-suggestion");
      await markNoteThinking({
        sourceKind: "annotation",
        sourceId: annotationId,
        teamId: auth.teamId,
        caseId: body.caseId,
        personId: auth.session.personId,
      });
      const { after } = await import("next/server");
      after(() =>
        considerAnnotation({
          annotationId,
          teamId: auth.teamId,
          caseId: body.caseId!,
          personId: auth.session.personId,
          force: true,
        }).catch(() => undefined),
      );
    } else if (body.action === "delete") {
      if (!body.annotationId) return NextResponse.json({ error: "Missing note." }, { status: 400 });
      await deleteAnnotation({ id: body.annotationId, teamId: auth.teamId, personId: auth.session.personId });
    } else {
      const ak = body.annotationKind;
      if (ak !== "highlight" && ak !== "comment" && ak !== "note") {
        return NextResponse.json({ error: "Pick highlight, comment or note." }, { status: 400 });
      }
      if (ak !== "highlight" && !body.body?.trim()) {
        return NextResponse.json({ error: "Write something first." }, { status: 400 });
      }
      if (ak !== "note" && !body.quote?.trim()) {
        return NextResponse.json({ error: "Select some text first." }, { status: 400 });
      }
      const added = await addAnnotation({
        team_id: auth.teamId,
        case_id: body.caseId,
        reading_kind: kind,
        reading_id: body.id,
        passage_ord: Number.isFinite(body.passageOrd) ? (body.passageOrd as number) : null,
        kind: ak,
        quote: body.quote ?? null,
        body: body.body ?? null,
        person_id: auth.session.personId,
      });
      // Each note or comment gets its own look: worth developing into the
      // working document, or kept as a note with a reason.
      if (ak !== "highlight") {
        const { markNoteThinking } = await import("@/lib/reading/note-to-suggestion");
        await markNoteThinking({
          sourceKind: "annotation",
          sourceId: added.id,
          teamId: auth.teamId,
          caseId: body.caseId,
          personId: auth.session.personId,
        }).catch(() => undefined);
        const { after } = await import("next/server");
        const { considerAnnotation } = await import("@/lib/reading/reading-room");
        after(() =>
          considerAnnotation({
            annotationId: added.id,
            teamId: auth.teamId,
            caseId: body.caseId!,
            personId: auth.session.personId,
          }).catch(() => undefined),
        );
      }
    }
    return NextResponse.json({ annotations: await withNames(auth.teamId, body.caseId, kind, body.id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save." }, { status: 400 });
  }
}
