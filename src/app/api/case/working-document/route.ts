import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/admin/permissions";
import { getPersonById } from "@/lib/db/repository";
import type { WorkingSectionKey } from "@/lib/db/supabase/working-doc-extra";
import { WORKING_SECTION_KEYS } from "@/lib/db/supabase/working-doc-extra";
import {
  answerWorkingSocratic,
  askSocraticForSection,
  crossSuggestion,
  decideLibraryFact,
  getWorkingDocumentHub,
  importWorkingDoc,
  saveWorkingSectionBody,
  startCruxWorkingDoc,
  suggestLibraryFact,
  tickSuggestion,
} from "@/lib/working-doc/service";
import type { Person, Role } from "@/lib/types";

export const runtime = "nodejs";

function isSectionKey(v: unknown): v is WorkingSectionKey {
  return (
    typeof v === "string" &&
    (WORKING_SECTION_KEYS as readonly string[]).includes(v)
  );
}

/** Own team by default. Coach/tech in admin view may pick another team. */
function resolveTeamId(
  person: { team_id: string | null; role: Role },
  session: { teamId: string | null; adminView: boolean; role: Role },
  requested: string | null,
): string | null {
  if (
    session.adminView &&
    isAdminRole(session.role) &&
    requested
  ) {
    return requested;
  }
  return person.team_id ?? session.teamId ?? null;
}

/** Members may read another team's doc (shared visibility); writes stay on own team. */
function canWriteWorkingDoc(
  person: Person,
  session: { teamId: string | null; adminView: boolean; role: Role },
  teamId: string,
): boolean {
  if (session.adminView && isAdminRole(session.role)) return true;
  const own = person.team_id ?? session.teamId;
  return Boolean(own && own === teamId);
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Unknown person" }, { status: 401 });
  }

  const url = new URL(req.url);
  const caseId = url.searchParams.get("caseId");
  const requested = url.searchParams.get("teamId");
  const ownTeam = person.team_id ?? session.teamId;
  // Default own team. Admin view may pick another. Members may also pass
  // another USC team id for shared read; POST still blocks their writes.
  const teamId =
    session.adminView && isAdminRole(session.role) && requested
      ? requested
      : requested && ownTeam
        ? requested
        : ownTeam;

  if (!caseId || !teamId) {
    return NextResponse.json(
      { error: "caseId and teamId are required." },
      { status: 400 },
    );
  }

  const hub = await getWorkingDocumentHub({
    caseId,
    teamId,
    personId: session.personId,
  });
  return NextResponse.json({
    ...hub,
    canEdit: canWriteWorkingDoc(person, session, teamId),
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Unknown person" }, { status: 401 });
  }

  const body = (await req.json()) as {
    action?: string;
    caseId?: string;
    teamId?: string;
    driveUrl?: string;
    sectionKey?: string;
    body?: string;
    socraticId?: string;
    answer?: string;
    suggestionId?: string;
    reason?: string | null;
    truthItemId?: string;
    decision?: "tick" | "cross";
    text?: string;
    citation?: string;
  };

  const caseId = body.caseId;
  const teamId = resolveTeamId(person, session, body.teamId ?? null);
  if (!caseId || !teamId) {
    return NextResponse.json(
      { error: "caseId and teamId are required." },
      { status: 400 },
    );
  }
  if (!canWriteWorkingDoc(person, session, teamId)) {
    return NextResponse.json(
      { error: "You can only edit your own team's working document." },
      { status: 403 },
    );
  }

  try {
    switch (body.action) {
      case "start_crux": {
        await startCruxWorkingDoc({
          caseId,
          teamId,
          personId: session.personId,
        });
        break;
      }
      case "import_doc": {
        if (!body.driveUrl?.trim()) {
          return NextResponse.json(
            { error: "Paste a Google Doc link from the Ethics Bowl Drive folder." },
            { status: 400 },
          );
        }
        await importWorkingDoc({
          caseId,
          teamId,
          personId: session.personId,
          driveUrl: body.driveUrl,
        });
        break;
      }
      case "save_section": {
        if (!isSectionKey(body.sectionKey)) {
          return NextResponse.json(
            { error: "Unknown section." },
            { status: 400 },
          );
        }
        await saveWorkingSectionBody({
          caseId,
          teamId,
          personId: session.personId,
          sectionKey: body.sectionKey,
          body: body.body ?? "",
        });
        break;
      }
      case "ask_socratic": {
        if (!isSectionKey(body.sectionKey)) {
          return NextResponse.json(
            { error: "Unknown section." },
            { status: 400 },
          );
        }
        await askSocraticForSection({
          caseId,
          teamId,
          personId: session.personId,
          sectionKey: body.sectionKey,
        });
        break;
      }
      case "answer_socratic": {
        if (!isSectionKey(body.sectionKey) || !body.socraticId) {
          return NextResponse.json(
            { error: "Need the section and the open question." },
            { status: 400 },
          );
        }
        if (!body.answer?.trim()) {
          return NextResponse.json(
            { error: "Write an answer first." },
            { status: 400 },
          );
        }
        await answerWorkingSocratic({
          caseId,
          teamId,
          personId: session.personId,
          socraticId: body.socraticId,
          sectionKey: body.sectionKey,
          answer: body.answer,
        });
        break;
      }
      case "tick_suggestion": {
        if (!body.suggestionId) {
          return NextResponse.json(
            { error: "Missing suggestion." },
            { status: 400 },
          );
        }
        await tickSuggestion({
          caseId,
          teamId,
          personId: session.personId,
          suggestionId: body.suggestionId,
        });
        break;
      }
      case "cross_suggestion": {
        if (!body.suggestionId) {
          return NextResponse.json(
            { error: "Missing suggestion." },
            { status: 400 },
          );
        }
        await crossSuggestion({
          caseId,
          teamId,
          personId: session.personId,
          suggestionId: body.suggestionId,
          reason: body.reason,
        });
        break;
      }
      case "decide_library": {
        if (!body.truthItemId || !body.decision) {
          return NextResponse.json(
            { error: "Pick a fact and tick or cross." },
            { status: 400 },
          );
        }
        await decideLibraryFact({
          caseId,
          teamId,
          personId: session.personId,
          truthItemId: body.truthItemId,
          decision: body.decision,
          reason: body.reason,
        });
        break;
      }
      case "suggest_fact": {
        await suggestLibraryFact({
          caseId,
          teamId,
          personId: session.personId,
          text: body.text ?? "",
          citation: body.citation ?? "",
        });
        break;
      }
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }

    const hub = await getWorkingDocumentHub({
      caseId,
      teamId,
      personId: session.personId,
    });
    return NextResponse.json({
      ...hub,
      canEdit: true,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Could not update the working document.",
      },
      { status: 400 },
    );
  }
}
