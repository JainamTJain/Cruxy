import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  recordPreferenceSignal,
  type PreferenceSignal,
} from "@/lib/learning/profile";
import { formatTailoredLine } from "@/lib/learning/types";

export const runtime = "nodejs";

/** Small chips under Cruxy replies: Shorter, Example, More detail. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as { signal?: string };
  const signal = body.signal as PreferenceSignal | undefined;
  if (
    signal !== "shorter" &&
    signal !== "example" &&
    signal !== "more_detail"
  ) {
    return NextResponse.json({ error: "Unknown signal." }, { status: 400 });
  }
  const profile = await recordPreferenceSignal(session.personId, signal);
  return NextResponse.json({
    ok: true,
    profile,
    tailored: formatTailoredLine(profile),
  });
}
