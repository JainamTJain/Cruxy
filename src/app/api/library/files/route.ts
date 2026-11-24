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

function clip(text: string, n: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1).trim()}…`;
}

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
    if (lower.startsWith("what")) what = clip(afterColon(line), 140);
    else if (lower.startsWith("new") || lower.startsWith("whats new")) {
      const t = afterColon(line);
      if (t) points.push(clip(t, 120));
    } else if (lower.startsWith("open") || lower.startsWith("question")) {
      const t = afterColon(line);
      if (t) questions.push(clip(t, 100));
    }
  }
  return { what, points: points.slice(0, 2), questions: questions.slice(0, 1) };
}

export async function GET(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  await ensureSampleLibraryBootstrapped(auth.session.personId);

  const url = new URL(req.url);
  const queue = url.searchParams.get("queue") === "1";
  const { isCoachViewer, isTechUploadFile } = await import("@/lib/auth/tech-uploads");
  const { getPersonById } = await import("@/lib/db/repository");
  const viewer = await getPersonById(auth.session.personId);
  // The coach does not see book chapters the tech admin uploaded.
  const hideUploads = isCoachViewer(viewer?.role);
  const all = (await listLibraryFiles()).filter((f) => !(hideUploads && isTechUploadFile(f)));
  const files = (queue ? await listSortingQueue() : all).filter((f) => !(hideUploads && isTechUploadFile(f)));
  const unreadables = listUnreadableFiles(all).map((u) => ({
    ...u,
    kindLabel: unreadableKindLabel(u.kind),
  }));

  return NextResponse.json(
    {
      files: files.map((f) => {
        const brief = briefFromCard(f.card);
        const typeLabel = (f.type ?? "file").replace(/_/g, " ");
        const casesLabel = f.case_numbers.length
          ? `case ${f.case_numbers.join(", ")}`
          : "general";
        const whatFallback = `${typeLabel} for ${casesLabel}`;
        const what =
          brief.what && brief.what !== f.name ? brief.what : whatFallback;
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
          what,
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
