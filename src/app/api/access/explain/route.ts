import { NextResponse } from "next/server";
import { lookupGlossary } from "@/lib/access/ethics-glossary";
import { getSession } from "@/lib/auth/session";
import { callCruxy } from "@/lib/cruxy/callCruxy";
import { isSampleDataMode } from "@/lib/db/config";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Explain a selected term: G-style glossary first, then Cruxy one-liner.
 * Soft-reads optional help_glossary / glossary_entries when Row G lands.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as { term?: string };
  const term = (body.term ?? "").trim().slice(0, 80);
  if (term.length < 2) {
    return NextResponse.json(
      { error: "Select a word or short phrase first." },
      { status: 400 },
    );
  }

  const local = lookupGlossary(term);
  if (local) {
    return NextResponse.json({
      term: local.term,
      meaning: local.meaning,
      source: "glossary" as const,
    });
  }

  const fromG = await softLookupGGlossary(term);
  if (fromG) {
    return NextResponse.json({
      term: fromG.term,
      meaning: fromG.meaning,
      source: "glossary" as const,
    });
  }

  if (isSampleDataMode() && !process.env.AI_GATEWAY_API_KEY) {
    return NextResponse.json({
      term,
      meaning: `In Crux, "${term}" is a word from Ethics Bowl prep. Open Help when that page is ready for a fuller list.`,
      source: "glossary" as const,
    });
  }

  const result = await callCruxy({
    feature: "access_explain_term",
    tier: "small",
    personId: session.personId,
    estimatedCostUsd: 0.01,
    messages: [
      {
        role: "system",
        content:
          "You help USC Ethics Bowl teammates who may speak English as a second language. Define the selected term in one short plain sentence. No jargon. No em dashes. Never say AI or a model name. If unsure, say so plainly.",
      },
      {
        role: "user",
        content: `Explain this term in one plain sentence: ${term}`,
      },
    ],
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error:
          "Cruxy could not explain that right now. Try again later, or ask a teammate.",
      },
      { status: 503 },
    );
  }

  const meaning = result.text.replace(/\s+/g, " ").trim().slice(0, 280);
  return NextResponse.json({
    term,
    meaning,
    source: "cruxy" as const,
  });
}

async function softLookupGGlossary(
  term: string,
): Promise<{ term: string; meaning: string } | null> {
  if (isSampleDataMode()) return null;
  try {
    const { getServiceSupabase } = await import("@/lib/db/supabase/client");
    const sb = getServiceSupabase();
    // Soft try common Row G table names; ignore if missing.
    for (const table of ["help_glossary", "glossary_entries"] as const) {
      const { data, error } = await sb
        .from(table)
        .select("term, meaning, definition, aliases")
        .limit(80);
      if (error || !data?.length) continue;
      const q = term.toLowerCase();
      for (const row of data) {
        const t = String(row.term ?? "");
        const meaning = String(
          (row as { meaning?: string }).meaning ??
            (row as { definition?: string }).definition ??
            "",
        );
        if (!t || !meaning) continue;
        const aliases = Array.isArray(row.aliases)
          ? (row.aliases as string[])
          : [];
        const keys = [t, ...aliases].map((s) => s.toLowerCase());
        if (keys.some((k) => k === q || q.includes(k) || k.includes(q))) {
          return { term: t, meaning: meaning.slice(0, 280) };
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}
