import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canWriteTeamData,
  resolveVisibleTeamId,
} from "@/lib/auth/team-privacy";
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
  tellIdeaFromWorkingDoc,
  tickSuggestion,
  undoTakeSuggestion,
  researchPendingIdea,
  researchRawIdeas,
} from "@/lib/working-doc/service";
import { runCoherenceCheck } from "@/lib/working-doc/coherence";

export const runtime = "nodejs";

function isSectionKey(v: unknown): v is WorkingSectionKey {
  return (
    typeof v === "string" &&
    (WORKING_SECTION_KEYS as readonly string[]).includes(v)
  );
}

export const maxDuration = 300;

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
  const { teamId } = resolveVisibleTeamId({
    person,
    session,
    requested,
  });

  if (!caseId || !teamId) {
    return NextResponse.json(
      { error: "caseId and teamId are required." },
      { status: 400 },
    );
  }

  // A team with no working document starts from the truth source, and Cruxy
  // critiques it in the background.
  if (canWriteTeamData(person, session, teamId)) {
    const { ensureStartedFromTruth } = await import(
      "@/lib/working-doc/start-all-from-truth"
    );
    const started = await ensureStartedFromTruth({
      caseId,
      teamId,
      personId: session.personId,
    }).catch(() => false);
    const { after } = await import("next/server");
    if (started) {
      const { critiqueNow } = await import("@/lib/critique/run");
      after(() =>
        critiqueNow([{ caseId, teamId }], session.personId).then(() => undefined),
      );
    }
    // Ideas told before research existed (or whose research failed) get
    // researched and drafted now.
    after(() =>
      researchRawIdeas({ caseId, teamId, personId: session.personId }).catch(
        () => undefined,
      ),
    );
  }

  const hub = await getWorkingDocumentHub({
    caseId,
    teamId,
    personId: session.personId,
  });
  return NextResponse.json({
    ...hub,
    canEdit: canWriteTeamData(person, session, teamId),
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
  const { teamId } = resolveVisibleTeamId({
    person,
    session,
    requested: body.teamId ?? null,
  });
  if (!caseId || !teamId) {
    return NextResponse.json(
      { error: "caseId and teamId are required." },
      { status: 400 },
    );
  }
  if (!canWriteTeamData(person, session, teamId)) {
    return NextResponse.json(
      { error: "You can only edit your own team's working document." },
      { status: 403 },
    );
  }

  let took: { suggestionId: string; sectionKey: string | null } | null = null;
  try {
    switch (body.action) {
      case "start_crux": {
        await startCruxWorkingDoc({
          caseId,
          teamId,
          personId: session.personId,
        });
        // Cruxy critiques the new document straight away.
        try {
          const { after } = await import("next/server");
          const { critiqueNow } = await import("@/lib/critique/run");
          after(() =>
            critiqueNow([{ caseId, teamId }], session.personId).then(
              () => undefined,
            ),
          );
        } catch {
          // Nightly cron still covers.
        }
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
        // Debounced critique: fills the suggestion rail after edits settle.
        try {
          const { after } = await import("next/server");
          const { scheduleCritiqueOnChange } = await import(
            "@/lib/critique/run"
          );
          after(() =>
            scheduleCritiqueOnChange({
              caseId,
              teamId,
              personId: session.personId,
            }),
          );
        } catch {
          // after() unavailable in some runtimes; nightly cron still covers.
        }
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
        const res = await tickSuggestion({
          caseId,
          teamId,
          personId: session.personId,
          suggestionId: body.suggestionId,
        });
        took = res.took.applied
          ? { suggestionId: body.suggestionId, sectionKey: res.took.sectionKey }
          : { suggestionId: body.suggestionId, sectionKey: null };
        break;
      }
      case "research_idea": {
        if (!body.suggestionId) {
          return NextResponse.json(
            { error: "Missing suggestion." },
            { status: 400 },
          );
        }
        const ok = await researchPendingIdea({
          caseId,
          teamId,
          personId: session.personId,
          suggestionId: body.suggestionId,
        });
        if (!ok) {
          return NextResponse.json(
            { error: "Cruxy couldn't research that idea just now. Try again in a minute." },
            { status: 502 },
          );
        }
        break;
      }
      case "undo_take": {
        if (!body.suggestionId) {
          return NextResponse.json(
            { error: "Missing suggestion." },
            { status: 400 },
          );
        }
        await undoTakeSuggestion({
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
      case "coherence_check": {
        await runCoherenceCheck({
          caseId,
          teamId,
          personId: session.personId,
        });
        break;
      }
      case "tell_idea": {
        if (!body.text?.trim()) {
          return NextResponse.json(
            { error: "Write your idea first." },
            { status: 400 },
          );
        }
        await tellIdeaFromWorkingDoc({
          caseId,
          teamId,
          personId: session.personId,
          text: body.text,
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
      took,
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
