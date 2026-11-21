import { NextResponse } from "next/server";
import { updateConsentChoice } from "@/lib/auth/passcode-rules";
import { getSession } from "@/lib/auth/session";
import { uploadVoiceSample } from "@/lib/auth/voice-sample";

export const runtime = "nodejs";

/** Settings: change consent or withdraw (deletes voice sample). */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  let recordingOk = false;
  let voicePath: string | null | undefined;
  let deleteVoice = false;

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    recordingOk = form.get("recordingOk") === "true";
    deleteVoice = form.get("deleteVoice") === "true" || !recordingOk;
    const file = form.get("voice");
    if (recordingOk && file && file instanceof File && file.size > 0) {
      const buf = Buffer.from(await file.arrayBuffer());
      voicePath = await uploadVoiceSample(
        session.personId,
        buf,
        file.type || "audio/webm",
      );
      deleteVoice = false;
    }
  } else {
    const body = (await req.json()) as {
      recordingOk?: boolean;
      deleteVoice?: boolean;
    };
    recordingOk = Boolean(body.recordingOk);
    deleteVoice = Boolean(body.deleteVoice) || !recordingOk;
  }

  await updateConsentChoice({
    personId: session.personId,
    recordingOk,
    voiceSamplePath: voicePath,
    deleteVoice,
  });

  return NextResponse.json({ ok: true, recordingOk });
}
