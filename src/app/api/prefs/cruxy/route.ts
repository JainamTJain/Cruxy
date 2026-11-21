import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonPrefs, savePersonPrefs } from "@/lib/team/repository";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const prefs = await getPersonPrefs(session.personId);
  return NextResponse.json({ prefs });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    hide_floating_cruxy?: boolean;
    cruxy_x?: number | null;
    cruxy_y?: number | null;
    cruxy_device?: string | null;
  };
  const prefs = await savePersonPrefs({
    person_id: session.personId,
    ...body,
  });
  return NextResponse.json({ prefs });
}
