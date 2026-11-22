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

  return NextResponse.json({
    files: files.map((f) => ({
      id: f.id,
      drive_id: f.drive_id,
      name: f.name,
      path: f.path,
      type: f.type,
      confidence: f.confidence,
      case_numbers: f.case_numbers,
      status: f.status,
      card: f.card,
      scanned_pdf: f.scanned_pdf,
      unreadable_reason: f.unreadable_reason,
      mime: f.mime,
      modified_at: f.modified_at,
    })),
    unreadables,
  });
}
