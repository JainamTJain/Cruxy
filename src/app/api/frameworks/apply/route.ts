import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getFrameworkById, lookupFramework } from "@/lib/frameworks/catalog";
import { getOrCreateFrameworkApply } from "@/lib/frameworks/apply";

export const runtime = "nodejs";

/**
 * Static term card + optional cached, cited "how it applies to this case".
 * Never invents: apply line is hidden when citations are missing.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const termId = url.searchParams.get("termId")?.trim() ?? "";
  const caseId = url.searchParams.get("caseId")?.trim() ?? "";
  const entry = termId ? getFrameworkById(termId) : null;
  if (!entry) {
    return NextResponse.json({ error: "Unknown term." }, { status: 404 });
  }
  if (!caseId) {
    return NextResponse.json({
      termId: entry.id,
      term: entry.term,
      explanation: entry.explanation,
      sourceUrl: entry.sourceUrl,
      sourceLabel: entry.sourceLabel,
      apply: null,
      citationIds: [] as string[],
    });
  }
  try {
    const row = await getOrCreateFrameworkApply({
      termId: entry.id,
      caseId,
      personId: session.personId,
    });
    return NextResponse.json({
      termId: row.entryId,
      term: row.term,
      explanation: row.explanation,
      sourceUrl: row.sourceUrl,
      sourceLabel: row.sourceLabel,
      apply: row.apply,
      citationIds: row.citationIds,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Could not load that term.",
      },
      { status: 400 },
    );
  }
}

/** Resolve a free-text phrase to a catalog entry (no case apply). */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    termId?: string;
    phrase?: string;
    caseId?: string | null;
  };
  const entry =
    (body.termId ? getFrameworkById(body.termId) : null) ??
    (body.phrase ? lookupFramework(body.phrase) : null);
  if (!entry) {
    return NextResponse.json({ error: "Unknown term." }, { status: 404 });
  }
  if (!body.caseId) {
    return NextResponse.json({
      termId: entry.id,
      term: entry.term,
      explanation: entry.explanation,
      sourceUrl: entry.sourceUrl,
      sourceLabel: entry.sourceLabel,
      apply: null,
      citationIds: [] as string[],
    });
  }
  const row = await getOrCreateFrameworkApply({
    termId: entry.id,
    caseId: body.caseId,
    personId: session.personId,
  });
  return NextResponse.json({
    termId: row.entryId,
    term: row.term,
    explanation: row.explanation,
    sourceUrl: row.sourceUrl,
    sourceLabel: row.sourceLabel,
    apply: row.apply,
    citationIds: row.citationIds,
  });
}
