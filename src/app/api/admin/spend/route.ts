import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canRead, canWrite } from "@/lib/admin/permissions";
import {
  getPersonById,
  getSpendCaps,
  listPeopleFull,
  logActivity,
  spendByFeature,
  spendByPerson,
  sumMonthlySpendUsd,
  updateSpendCaps,
} from "@/lib/db/repository";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const person = await getPersonById(session.personId);
  if (!person || !canRead(person.role, "spend")) {
    // Dr. B cannot see spend per permissions table
    return NextResponse.json(
      { error: "Spend dashboard is technical admin only." },
      { status: 403 },
    );
  }

  const [spent, caps, byFeature, byPerson, people] = await Promise.all([
    sumMonthlySpendUsd(),
    getSpendCaps(),
    spendByFeature(),
    spendByPerson(),
    listPeopleFull(),
  ]);
  const names = new Map(people.map((p) => [p.id, p.name]));

  const ledgerTotal = byFeature.reduce((s, f) => s + f.cost_usd, 0);
  return NextResponse.json({
    spent,
    ledgerTotal,
    matchesLedger: Math.abs(spent - ledgerTotal) < 0.0001,
    caps,
    byFeature,
    byPerson: byPerson.map((p) => ({
      ...p,
      name: p.person_id ? names.get(p.person_id) ?? "unknown" : "system",
    })),
    canEdit: canWrite(person.role, "spend"),
  });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const person = await getPersonById(session.personId);
  if (!person || !canWrite(person.role, "spend")) {
    return NextResponse.json(
      { error: "Only the technical admin can change caps or pause research." },
      { status: 403 },
    );
  }

  const body = (await req.json()) as {
    monthly_usd?: number;
    per_round_usd?: number;
    per_research_night_usd?: number;
    per_person_assistant_day_usd?: number;
    research_paused?: boolean;
  };

  const next = await updateSpendCaps(body, person.id);
  await logActivity({
    person_id: person.id,
    action: "spend_caps_updated",
    target: "spend_caps",
    meta: body as Record<string, unknown>,
  });
  return NextResponse.json({ ok: true, caps: next });
}
