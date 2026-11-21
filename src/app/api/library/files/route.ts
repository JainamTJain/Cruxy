import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import {
  listLibraryFiles,
  listSortingQueue,
} from "@/lib/db/library-repository";

export async function GET(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const queue = url.searchParams.get("queue") === "1";
  const files = queue ? await listSortingQueue() : await listLibraryFiles();

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
      modified_at: f.modified_at,
    })),
  });
}
