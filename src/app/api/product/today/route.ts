import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById, listCases } from "@/lib/db/repository";
import { GET as programMapGet } from "@/app/api/program-map/route";
import {
  buildFocusActions,
  DEC5_HELPERS,
} from "@/lib/product/today";

export const runtime = "nodejs";

/**
 * Personal Today payload for Wave 8 G.
 * Reuses program-map; does not own case/roadmap/library logic.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  const programRes = await programMapGet();
  if (!programRes.ok) {
    return NextResponse.json(
      { error: "Could not load Today" },
      { status: programRes.status },
    );
  }

  const map = (await programRes.json()) as {
    nextActions?: { label: string; detail: string; href: string }[] | string[];
    todaySessions?: {
      sessionId: string;
      title: string;
      href: string;
      caseNumber: number | null;
      invitePending?: boolean;
    }[];
    daysToCompetition?: number | null;
    competition?: { name: string; date: string; place: string | null } | null;
    todayLabel?: string;
    cases?: { id: string; number: number; title: string }[];
  };

  const rawActions: { label: string; detail: string; href: string }[] = [];
  for (const a of map.nextActions ?? []) {
    if (typeof a === "string") {
      rawActions.push({
        label: "DO NEXT",
        detail: a,
        href: "/revision/roadmap",
      });
    } else {
      rawActions.push(a);
    }
  }

  const extras = DEC5_HELPERS.map((h) => ({
    label: h.id === "judges" ? "DRILL" : h.id === "warmup" ? "WARM-UP" : "CARDS",
    detail: h.detail,
    href: h.href,
  }));

  const actions = buildFocusActions(rawActions, extras);
  const person = await getPersonById(session.personId);
  const allCases = (await listCases()).filter((c) => c.active);

  const sessionCaseNum = map.todaySessions?.find((s) => s.caseNumber != null)
    ?.caseNumber;
  const leadCase =
    (sessionCaseNum != null
      ? allCases.find((c) => c.number === sessionCaseNum)
      : null) ??
    allCases[0] ??
    null;

  return NextResponse.json({
    personName: person?.name ?? session.name,
    todayLabel: map.todayLabel ?? null,
    daysToCompetition: map.daysToCompetition ?? null,
    competition: map.competition ?? null,
    todaySessions: map.todaySessions ?? [],
    actions,
    helpers: DEC5_HELPERS,
    leadCase: leadCase
      ? { id: leadCase.id, number: leadCase.number, title: leadCase.title }
      : null,
    nextDrillHref: "/practice/drills/judges-qa",
  });
}
