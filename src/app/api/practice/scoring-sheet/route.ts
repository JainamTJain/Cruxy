import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import {
  confirmScoringSheet,
  getActiveScoringSheet,
  proposeNewerScoringSheet,
} from "@/lib/db/supabase/practice-drills-extra";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sheet = await getActiveScoringSheet();
  return NextResponse.json(sheet);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person || person.role !== "tech_admin" || !session.adminView) {
    return NextResponse.json(
      { error: "Only Jainam in admin view can confirm a newer sheet." },
      { status: 403 },
    );
  }

  const body = (await req.json()) as {
    action?: "propose" | "confirm" | "reject";
    versionId?: string;
    sourceLabel?: string;
    checksum?: string;
    diffSummary?: string;
  };

  if (body.action === "propose") {
    const pending = await proposeNewerScoringSheet({
      actorId: person.id,
      sourceLabel:
        body.sourceLabel ??
        "APPE IEB Fillable Scoring Sheet (newer from Drive)",
      checksum: body.checksum ?? `drive-${Date.now()}`,
      diffSummary:
        body.diffSummary ??
        "Drive file changed versus the active August 2020 sheet. Review wording and scales before switching.",
    });
    return NextResponse.json({ pending });
  }

  if (
    (body.action === "confirm" || body.action === "reject") &&
    body.versionId
  ) {
    await confirmScoringSheet({
      versionId: body.versionId,
      actorId: person.id,
      approve: body.action === "confirm",
    });
    const sheet = await getActiveScoringSheet();
    return NextResponse.json({ ok: true, sheet });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
