import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { fileToText } from "@/lib/reading/import-reading";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Read the text out of an uploaded team document (PDF, Word, text) for the import review. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file." }, { status: 400 });
  if (file.size > 4.4 * 1024 * 1024) {
    return NextResponse.json({ error: "Files over 4 MB can't be uploaded. Share it as a Google Doc link instead." }, { status: 400 });
  }
  try {
    const text = await fileToText({ name: file.name, type: file.type || "", bytes: new Uint8Array(await file.arrayBuffer()) });
    if (text.trim().length < 40) {
      return NextResponse.json({ error: `Cruxy could not read text from ${file.name}. If it is a scan, paste the text.` }, { status: 400 });
    }
    return NextResponse.json({ title: file.name.replace(/\.[a-z0-9]+$/i, ""), text: text.slice(0, 400_000) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not read that file." }, { status: 400 });
  }
}
