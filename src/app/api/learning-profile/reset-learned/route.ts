import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { resetLearnedPrefs } from "@/lib/learning/profile";
import { formatTailoredLine } from "@/lib/learning/types";

export const runtime = "nodejs";

/** Clear prefs learned from Cruxy chips. Keeps the four concrete choices. */
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const profile = await resetLearnedPrefs(session.personId);
  return NextResponse.json({
    ok: true,
    profile,
    tailored: formatTailoredLine(profile),
  });
}
