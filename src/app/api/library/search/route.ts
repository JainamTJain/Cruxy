import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { searchLibraryUnified } from "@/lib/db/supabase/library-search-extra";

export async function GET(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const caseNumber = url.searchParams.get("case");
  const type = url.searchParams.get("type");
  const teamId = url.searchParams.get("team") ?? undefined;

  const hits = await searchLibraryUnified({
    q,
    caseNumber: caseNumber ? Number(caseNumber) : undefined,
    type: type || undefined,
    teamId,
    personId: auth.session.personId,
  });

  return NextResponse.json({
    hits: hits.map((h) => ({
      ...h,
      citation: [h.title, h.anchor].filter(Boolean).join(", "),
    })),
    q,
  });
}
