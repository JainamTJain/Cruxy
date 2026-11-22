import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById, listCases } from "@/lib/db/repository";
import { getSkillChart } from "@/lib/db/practice-repository";
import { getTeamBrief } from "@/lib/db/supabase/team-brief-extra";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const caseId = url.searchParams.get("caseId");
  const person = await getPersonById(session.personId);
  const cases = await listCases().catch(() => []);
  const caseRow = caseId
    ? cases.find((c) => c.id === caseId) ?? null
    : null;

  let stance: string | null = null;
  if (caseId && person?.team_id) {
    const brief = await getTeamBrief(person.team_id, caseId).catch(() => null);
    stance = brief?.thesis?.trim() || null;
  }

  const chart = await getSkillChart(session.personId).catch(() => null);
  const encouragement = buildEncouragement(chart?.skills ?? null, person?.name ?? "You");

  return NextResponse.json({
    stance,
    encouragement,
    caseTitle: caseRow ? `Case ${caseRow.number}: ${caseRow.title}` : null,
  });
}

function buildEncouragement(
  skills: Record<string, number> | null,
  name: string,
): string {
  const first = name.split(" ")[0] || "You";
  if (!skills || Object.keys(skills).length === 0) {
    return `${first}, show up as yourself. Steady is enough.`;
  }
  const entries = Object.entries(skills).sort((a, b) => b[1] - a[1]);
  const top = entries[0];
  if (!top) return `${first}, trust the work you already did.`;
  const label = top[0].replace(/_/g, " ");
  const score = Math.round(top[1]);
  if (score <= 0) {
    return `${first}, every round you finish is progress against your own past.`;
  }
  return `${first}, your ${label} has reached ${score} against your own past. Carry that in.`;
}
