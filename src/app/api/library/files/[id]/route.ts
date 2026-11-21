import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import {
  getLibraryFile,
  listCommentsForFile,
  listHighlightsForFile,
  listPassagesForFile,
} from "@/lib/db/library-repository";
import {
  listCasePagesForNumbers,
  listRelatedFilesForCases,
} from "@/lib/db/supabase/library-extra";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const file = await getLibraryFile(id);
  if (!file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [passages, highlights, comments, casePages, related] =
    await Promise.all([
      listPassagesForFile(id),
      listHighlightsForFile(id),
      listCommentsForFile(id),
      listCasePagesForNumbers(file.case_numbers),
      listRelatedFilesForCases(file.case_numbers, id),
    ]);

  return NextResponse.json({
    file: {
      id: file.id,
      drive_id: file.drive_id,
      name: file.name,
      path: file.path,
      mime: file.mime,
      type: file.type,
      confidence: file.confidence,
      case_numbers: file.case_numbers,
      case_ids: file.case_ids,
      status: file.status,
      card: file.card,
      text_content: file.text_content,
      scanned_pdf: file.scanned_pdf,
      modified_at: file.modified_at,
    },
    passages: passages.map((p) => ({
      id: p.id,
      file_id: p.file_id,
      drive_id: p.drive_id,
      anchor: p.anchor,
      text: p.text,
      ord: p.ord,
    })),
    highlights,
    comments,
    casePages,
    related,
  });
}
