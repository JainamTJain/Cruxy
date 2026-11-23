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
export const maxDuration = 120;

async function withNames(teamId: string, caseId: string, kind: ReadingKind, id: string) {
  const [anns, people] = await Promise.all([
    listAnnotations({ teamId, caseId, kind, readingId: id }),
    listPeopleFull(),
  ]);
  return anns.map((a) => ({
    ...a,
    person_name: people.find((p) => p.id === a.person_id)?.name?.split(" ")[0] ?? null,
  }));
}

function parseKind(k: string | null): ReadingKind | null {
  return k === "web" || k === "import" ? k : null;
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
    action?: "add" | "delete";
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
    if (body.action === "delete") {
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
      await addAnnotation({
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
      // Notes and comments feed Cruxy's suggestions on the working document.
      if (ak !== "highlight") {
        try {
          const { after } = await import("next/server");
          const { scheduleCritiqueOnChange } = await import("@/lib/critique/run");
          after(() =>
            scheduleCritiqueOnChange({
              caseId: body.caseId!,
              teamId: auth.teamId,
              personId: auth.session.personId,
            }).catch(() => undefined),
          );
        } catch {
          // The nightly review still picks the note up.
        }
      }
    }
    return NextResponse.json({ annotations: await withNames(auth.teamId, body.caseId, kind, body.id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save." }, { status: 400 });
  }
}
