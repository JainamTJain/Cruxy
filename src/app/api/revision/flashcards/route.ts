import { NextResponse } from "next/server";
import {
  requirePerson,
  resolveTeamOrDeny,
  revisionError,
} from "@/lib/revision/api-auth";
import type { FsrsRating } from "@/lib/revision/fsrs";
import {
  autoAssignLeadDecks,
  dueDeckForPerson,
  ensureFlashcardsForTeamCase,
  listFlashcards,
  optInDeck,
  reviewFlashcard,
  setFlashcardPinned,
  studyingLabels,
  updateTruthItemText,
} from "@/lib/revision/repository";

export async function GET(req: Request) {
  const auth = await requirePerson();
  if ("error" in auth) return auth.error;
  try {
    await autoAssignLeadDecks(auth.session.personId);
    const url = new URL(req.url);
    const due = url.searchParams.get("due") === "1";
    const requestedTeam = url.searchParams.get("teamId");
    const caseId = url.searchParams.get("caseId") ?? undefined;
    let teamId: string | undefined;
    if (requestedTeam && caseId) {
      const team = resolveTeamOrDeny(
        auth.person,
        auth.session,
        requestedTeam,
      );
      if ("error" in team) return team.error;
      teamId = team.teamId;
      await ensureFlashcardsForTeamCase(teamId, caseId);
    }
    if (due) {
      const deck = await dueDeckForPerson(auth.session.personId);
      const labels = await studyingLabels(auth.session.personId);
      return NextResponse.json({
        cards: deck.cards,
        studying: labels,
        dailyTarget: deck.dailyTarget,
        cramMode: deck.cramMode,
        daysToCompetition: deck.daysToCompetition,
        leadCaseCount: deck.leadCaseCount,
        totalInRotation: deck.totalInRotation,
        openAttackCount: deck.openAttackCount ?? 0,
      });
    }
    const cards = (await listFlashcards({ teamId, caseId })).map((card) => ({
      card,
      state: null,
    }));
    const labels = await studyingLabels(auth.session.personId);
    return NextResponse.json({ cards, studying: labels });
  } catch (err) {
    return revisionError(err, "Could not load flashcards. Try again.");
  }
}

export async function POST(req: Request) {
  const auth = await requirePerson();
  if ("error" in auth) return auth.error;
  try {
    const body = (await req.json()) as {
      action: string;
      cardId?: string;
      grade?: number;
      mode?: "typed" | "spoken";
      teamId?: string;
      caseId?: string;
      truthItemId?: string;
      text?: string;
      pinned?: boolean;
    };

    if (body.action === "review") {
      if (!body.cardId || !body.grade) {
        return NextResponse.json(
          { error: "cardId and grade required" },
          { status: 400 },
        );
      }
      const result = await reviewFlashcard({
        personId: auth.session.personId,
        cardId: body.cardId,
        grade: body.grade as FsrsRating,
        mode: body.mode,
      });
      if (result && typeof result === "object" && "state" in result) {
        return NextResponse.json(result);
      }
      return NextResponse.json({ state: result });
    }

    if (body.action === "pin") {
      if (!body.cardId) {
        return NextResponse.json({ error: "cardId required" }, { status: 400 });
      }
      const state = await setFlashcardPinned({
        personId: auth.session.personId,
        cardId: body.cardId,
        pinned: body.pinned !== false,
      });
      return NextResponse.json({ state });
    }

    if (body.action === "opt_in") {
      if (!body.caseId) {
        return NextResponse.json(
          { error: "caseId required" },
          { status: 400 },
        );
      }
      const team = resolveTeamOrDeny(auth.person, auth.session, body.teamId);
      if ("error" in team) return team.error;
      await optInDeck({
        personId: auth.session.personId,
        teamId: team.teamId,
        caseId: body.caseId,
        assigned: false,
      });
      await ensureFlashcardsForTeamCase(team.teamId, body.caseId);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "sync_truth") {
      if (!body.caseId) {
        return NextResponse.json(
          { error: "caseId required" },
          { status: 400 },
        );
      }
      const team = resolveTeamOrDeny(auth.person, auth.session, body.teamId);
      if ("error" in team) return team.error;
      const cards = await ensureFlashcardsForTeamCase(team.teamId, body.caseId);
      return NextResponse.json({ cards });
    }

    if (body.action === "update_truth") {
      if (!body.truthItemId || !body.text?.trim()) {
        return NextResponse.json(
          { error: "truthItemId and text required" },
          { status: 400 },
        );
      }
      const result = await updateTruthItemText(
        body.truthItemId,
        body.text.trim(),
        auth.session.personId,
      );
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return revisionError(err, "Could not save flashcard progress. Try again.");
  }
}
