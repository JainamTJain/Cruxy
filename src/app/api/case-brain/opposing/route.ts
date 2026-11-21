import { NextResponse } from "next/server";
import { requireMemberSession } from "@/lib/case-brain/auth";
import { addOpposingPosition } from "@/lib/case-brain/service";

export async function POST(req: Request) {
  const auth = await requireMemberSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await req.json()) as {
    caseId?: string;
    title?: string;
    strongest_support?: string;
    weak_point?: string;
    commentary_angles?: [string, string];
  };
  if (
    !body.caseId ||
    !body.title?.trim() ||
    !body.strongest_support?.trim() ||
    !body.weak_point?.trim() ||
    !body.commentary_angles?.[0] ||
    !body.commentary_angles?.[1]
  ) {
    return NextResponse.json({ error: "Incomplete opposing position." }, { status: 400 });
  }
  const position = await addOpposingPosition({
    caseId: body.caseId,
    teamId: auth.teamId,
    personId: auth.session.personId,
    title: body.title,
    strongest_support: body.strongest_support,
    weak_point: body.weak_point,
    commentary_angles: body.commentary_angles,
  });
  return NextResponse.json({ position });
}
