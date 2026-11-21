import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canRead } from "@/lib/admin/permissions";
import {
  featureUsageStats,
  getPersonById,
  getProgramTotals,
  listPeopleFull,
} from "@/lib/db/repository";

export const runtime = "nodejs";

/** "Is Crux working?" (Jainam / tech admin only). */
export async function GET() {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const person = await getPersonById(session.personId);
  if (!person || !canRead(person.role, "is_crux_working")) {
    return NextResponse.json(
      { error: "Is Crux working? is shown only on Jainam's portal." },
      { status: 403 },
    );
  }

  const [usage, totals, people] = await Promise.all([
    featureUsageStats(),
    getProgramTotals(),
    listPeopleFull(),
  ]);

  const signedIn = people.filter((p) => p.last_sign_in_at).length;
  return NextResponse.json({
    hypothesis:
      "People who drill, redo, and read more should improve faster on their own scores. Tracks 3–5 fill the causal links; this view shows feature use and useful marks for now.",
    usage,
    totals,
    signedIn,
    rosterSize: people.length,
    ignored: usage
      .filter((u) => u.uses === 0)
      .map((u) => u.feature)
      .concat(
        ["flashcard_review", "socratic_drill", "peer_judge"].filter(
          (f) => !usage.some((u) => u.feature === f),
        ),
      ),
  });
}
