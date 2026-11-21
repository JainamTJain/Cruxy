import { NextResponse } from "next/server";
import { saveConsent } from "@/lib/auth/passcode-rules";
import { getSession, updateSession } from "@/lib/auth/session";
import { uploadVoiceSample } from "@/lib/auth/voice-sample";

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
      const buf = Buffer.from(await file.arrayBuffer());
      voicePath = await uploadVoiceSample(
        session.personId,
        buf,
        file.type || "audio/webm",
      );
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
