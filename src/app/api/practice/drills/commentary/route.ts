import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById, listCases } from "@/lib/db/repository";
import {
  generateCommentaryPresentation,
  listClaimTextsForDrill,
} from "@/lib/practice/drills-extra";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person?.team_id) {
    return NextResponse.json(
      { error: "Join a team before this drill." },
      { status: 400 },
    );
  }
  const body = (await req.json()) as { caseId?: string };
  const cases = await listCases();
  const caseRow =
    cases.find((c) => c.id === body.caseId) ??
    cases.find((c) => c.active) ??
    null;
  if (!caseRow) {
    return NextResponse.json({ error: "No case available" }, { status: 400 });
  }
  const claims = await listClaimTextsForDrill(person.team_id, caseRow.id);
  const result = await generateCommentaryPresentation({
    personId: person.id,
    caseTitle: caseRow.title,
    caseNumber: caseRow.number,
    claimTexts: claims,
  });
  return NextResponse.json({
    caseId: caseRow.id,
    caseNumber: caseRow.number,
    caseTitle: caseRow.title,
    ...result,
  });
}
