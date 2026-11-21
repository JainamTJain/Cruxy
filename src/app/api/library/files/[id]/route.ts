import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import {
  getLibraryFile,
  listCommentsForFile,
  listHighlightsForFile,
  listPassagesForFile,
  listCases,
} from "@/lib/db/library-repository";

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

  const [passages, highlights, comments, cases] = await Promise.all([
    listPassagesForFile(id),
    listHighlightsForFile(id),
    listCommentsForFile(id),
    listCases(),
  ]);

  const casePages = cases.filter((c) => file.case_numbers.includes(c.number));

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
    casePages: casePages.map((c) => ({
      id: c.id,
      number: c.number,
      title: c.title,
      case_set_page: c.case_set_page,
      crux: c.crux,
      trap: c.trap,
    })),
  });
}
