import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canRead } from "@/lib/admin/permissions";
import { summarizeCruxyOutcomes } from "@/lib/cruxy/outcomes";
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

  const [usage, totals, people, outcomes] = await Promise.all([
    featureUsageStats(),
    getProgramTotals(),
    listPeopleFull(),
    summarizeCruxyOutcomes(),
  ]);

  const signedIn = people.filter((p) => p.last_sign_in_at).length;
  const drillUses = usage
    .filter((u) =>
      /drill|redo|flashcard|reading|assistant/i.test(u.feature),
    )
    .reduce((s, u) => s + u.uses, 0);
  const usefulMarks = usage.reduce((s, u) => s + u.useful_marks, 0);
  const redo = totals.redo_improvements ?? 0;
  return NextResponse.json({
    hypothesis:
      "Use against improvement: people who drill, redo and read more should improve faster on their own scores. This portal compares feature use and useful marks with redo improvements for the program.",
    usage,
    totals,
    signedIn,
    rosterSize: people.length,
    correlationNote:
      drillUses === 0 && redo === 0
        ? "No drill or redo activity yet. The link between use and score gains will show up here as people practice."
        : `${drillUses} practice-related calls and ${usefulMarks} useful marks so far, with ${redo} redo improvements logged. Watch whether heavier users climb on their own past scores.`,
    outcomes,
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
