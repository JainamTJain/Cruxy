import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { searchLibrary } from "@/lib/db/library-repository";

export async function GET(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const caseNumber = url.searchParams.get("case");
  const teamId = url.searchParams.get("team");
  const type = url.searchParams.get("type");

  const hits = await searchLibrary({
    q,
    caseNumber: caseNumber ? Number(caseNumber) : null,
    teamId: teamId || null,
    type: type || null,
  });

  return NextResponse.json({ hits, q });
}
