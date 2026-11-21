import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
// Interim: H owns match_passages; swap when that RPC ships.
import { searchLibraryWithEmbed } from "@/lib/db/supabase/library-extra";

export async function GET(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const caseNumber = url.searchParams.get("case");
  const type = url.searchParams.get("type");

  const hits = await searchLibraryWithEmbed({
    q,
    caseNumber: caseNumber ? Number(caseNumber) : undefined,
    type: type || undefined,
    personId: auth.session.personId,
  });

  return NextResponse.json({
    hits: hits.map((h) => ({
      ...h,
      citation: `${h.file_name} · ${h.anchor}`,
    })),
    q,
  });
}
