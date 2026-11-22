import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import {
  listLibraryFiles,
  listSortingQueue,
} from "@/lib/db/library-repository";
import { ensureSampleLibraryBootstrapped } from "@/lib/db/supabase/library-extra";
import {
  listUnreadableFiles,
  unreadableKindLabel,
} from "@/lib/library/unreadable";

/** Pull short lines from the five-line card without loading passages. */
function briefFromCard(card: string | null): {
  what: string | null;
  points: string[];
  questions: string[];
} {
  if (!card) return { what: null, points: [], questions: [] };
  const lines = card.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const afterColon = (line: string) => {
    const i = line.indexOf(":");
    return i >= 0 ? line.slice(i + 1).trim() : line;
  };
  let what: string | null = null;
  const points: string[] = [];
  const questions: string[] = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith("what")) what = afterColon(line);
    else if (lower.startsWith("new") || lower.startsWith("whats new")) {
      const t = afterColon(line);
      if (t) points.push(t);
    } else if (lower.startsWith("open") || lower.startsWith("question")) {
      const t = afterColon(line);
      if (t) questions.push(t);
    }
  }
  return { what, points: points.slice(0, 3), questions: questions.slice(0, 2) };
}

export async function GET(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  await ensureSampleLibraryBootstrapped(auth.session.personId);

  const url = new URL(req.url);
  const queue = url.searchParams.get("queue") === "1";
  const all = await listLibraryFiles();
  const files = queue ? await listSortingQueue() : all;
  const unreadables = listUnreadableFiles(all).map((u) => ({
    ...u,
    kindLabel: unreadableKindLabel(u.kind),
  }));

  return NextResponse.json(
    {
      files: files.map((f) => {
        const brief = briefFromCard(f.card);
        return {
          id: f.id,
          drive_id: f.drive_id,
          name: f.name,
          path: f.path,
          type: f.type,
          confidence: f.confidence,
          case_numbers: f.case_numbers,
          case_ids: f.case_ids,
          status: f.status,
          scanned_pdf: f.scanned_pdf,
          unreadable_reason: f.unreadable_reason,
          mime: f.mime,
          modified_at: f.modified_at,
          what: brief.what,
          points: brief.points,
          questions: brief.questions,
          speakers: [] as { who: string; line: string }[],
        };
      }),
      unreadables,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=20, stale-while-revalidate=40",
      },
    },
  );
}
