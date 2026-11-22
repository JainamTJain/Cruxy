import { NextResponse } from "next/server";
import { requireMemberSession } from "@/lib/case-brain/auth";
import { getPersonById } from "@/lib/db/repository";
import { searchGlobal } from "@/lib/search/global";

export async function GET(req: Request) {
  const auth = await requireMemberSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const person = await getPersonById(auth.session.personId);
  const isAdmin = Boolean(
    person &&
      (person.role === "tech_admin" || person.role === "coach_admin") &&
      auth.session.adminView,
  );

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const result = await searchGlobal({
    q,
    teamId: auth.teamId,
    personId: auth.session.personId,
    isAdmin,
    limit: 40,
  });

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "private, max-age=10, stale-while-revalidate=30",
      "Server-Timing": `search;dur=${result.took_ms}`,
    },
  });
}
