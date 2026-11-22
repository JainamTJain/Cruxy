import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import {
  assignUnmatchedSplit,
  confirmImportReview,
  createImportReview,
  getImportReview,
  openOrLatestReview,
} from "@/lib/working-doc/team-import";
import { startAllWorkingDocuments } from "@/lib/working-doc/start-all-from-truth";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Unknown person" }, { status: 401 });
  }
  const teamId = person.team_id ?? session.teamId;
  if (!teamId) {
    return NextResponse.json(
      { error: "Join a team first." },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const batchId = url.searchParams.get("batchId");
  if (batchId) {
    try {
      const review = await getImportReview({ batchId, teamId });
      return NextResponse.json(review);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Not found" },
        { status: 404 },
      );
    }
  }

  const open = await openOrLatestReview(teamId);
  if (!open) return NextResponse.json({ batch: null });
  const review = await getImportReview({ batchId: open.id, teamId });
  return NextResponse.json(review);
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
  const teamId = person.team_id ?? session.teamId;
  if (!teamId) {
    return NextResponse.json(
      { error: "Join a team first." },
      { status: 403 },
    );
  }

  const body = (await req.json()) as {
    action?: string;
    sources?: Array<{
      driveUrl?: string | null;
      pastedText?: string | null;
      title?: string | null;
    }>;
    driveUrl?: string;
    pastedText?: string;
    batchId?: string;
    splitId?: string;
    caseId?: string;
  };

  try {
    switch (body.action) {
      case "start_review": {
        const sources =
          body.sources?.length
            ? body.sources
            : [
                {
                  driveUrl: body.driveUrl ?? null,
                  pastedText: body.pastedText ?? null,
                },
              ];
        const review = await createImportReview({
          teamId,
          personId: session.personId,
          sources,
        });
        return NextResponse.json(review);
      }
      case "assign_split": {
        if (!body.batchId || !body.splitId || !body.caseId) {
          return NextResponse.json(
            { error: "Need batch, split and case." },
            { status: 400 },
          );
        }
        await assignUnmatchedSplit({
          batchId: body.batchId,
          splitId: body.splitId,
          caseId: body.caseId,
          teamId,
        });
        const review = await getImportReview({
          batchId: body.batchId,
          teamId,
        });
        return NextResponse.json(review);
      }
      case "confirm": {
        if (!body.batchId) {
          return NextResponse.json(
            { error: "Missing batch." },
            { status: 400 },
          );
        }
        const result = await confirmImportReview({
          batchId: body.batchId,
          teamId,
          personId: session.personId,
        });
        return NextResponse.json(result);
      }
      case "start_all": {
        const result = await startAllWorkingDocuments({
          teamId,
          personId: session.personId,
        });
        return NextResponse.json(result);
      }
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Could not run the team import.",
      },
      { status: 400 },
    );
  }
}
