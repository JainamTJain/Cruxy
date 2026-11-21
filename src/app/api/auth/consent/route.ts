import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { saveConsent } from "@/lib/auth/passcode-rules";
import { getSession, updateSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  let recordingOk = false;
  let voicePath: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    recordingOk = form.get("recordingOk") === "true";
    const file = form.get("voice");
    if (recordingOk && file && file instanceof File && file.size > 0) {
      const dir = path.join(process.cwd(), ".voice-samples");
      await fs.mkdir(dir, { recursive: true });
      const dest = path.join(dir, `${session.personId}.webm`);
      const buf = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(dest, buf);
      voicePath = dest;
    }
  } else {
    const body = (await req.json()) as { recordingOk?: boolean };
    recordingOk = Boolean(body.recordingOk);
  }

  await saveConsent({
    personId: session.personId,
    recordingOk,
    voiceSamplePath: voicePath,
  });
  await updateSession({ mustConsent: false });

  return NextResponse.json({ ok: true });
}
