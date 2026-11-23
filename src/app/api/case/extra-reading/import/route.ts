import { NextResponse } from "next/server";
import { requireMemberSession } from "@/lib/case-brain/auth";
import { importReading, MAX_IMPORT_BYTES } from "@/lib/reading/import-reading";

export const runtime = "nodejs";
export const maxDuration = 180;

/**
 * Import extra reading into a case for the signed-in person's team: a file
 * (PDF, Word, text), a web link, or pasted text. Cruxy digests it.
 */
export async function POST(req: Request) {
  const auth = await requireMemberSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const form = await req.formData();
    const caseId = String(form.get("caseId") ?? "");
    const teamId = String(form.get("teamId") ?? auth.teamId);
    if (!caseId) return NextResponse.json({ error: "caseId required" }, { status: 400 });
    if (teamId !== auth.teamId) {
      return NextResponse.json(
        { error: "You can only add reading to your own team." },
        { status: 403 },
      );
    }
    const file = form.get("file");
    let filePart: { name: string; type: string; bytes: Uint8Array } | null = null;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_IMPORT_BYTES) {
        return NextResponse.json({ error: "That file is too large to import (15 MB max)." }, { status: 400 });
      }
      filePart = {
        name: file.name || "reading",
        type: file.type || "",
        bytes: new Uint8Array(await file.arrayBuffer()),
      };
    }
    const result = await importReading({
      caseId,
      teamId,
      personId: auth.session.personId,
      title: (form.get("title") as string | null) ?? null,
      note: (form.get("note") as string | null) ?? null,
      text: (form.get("text") as string | null) ?? null,
      url: ((form.get("url") as string | null) ?? "").trim() || null,
      file: filePart,
    });
    if (result.status === "done") {
      // New reading: Cruxy reviews the working document with it in hand.
      const { after } = await import("next/server");
      const { scheduleCritiqueOnChange } = await import("@/lib/critique/run");
      after(() =>
        scheduleCritiqueOnChange({ caseId, teamId, personId: auth.session.personId, delayMs: 0 }).catch(() => undefined),
      );
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not import that reading." },
      { status: 400 },
    );
  }
}
