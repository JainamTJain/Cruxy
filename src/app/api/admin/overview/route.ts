import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canRead, PERMISSION_TABLE } from "@/lib/admin/permissions";
import {
  getPersonById,
  getSpendCaps,
  listActivityLog,
  listBookRequests,
  listCalibration,
  listDriveSortQueue,
  listPeopleFull,
  listTeams,
  spendByFeature,
  sumMonthlySpendUsd,
  teamReadinessAverages,
  buildWeeklyEmailPreview,
} from "@/lib/db/repository";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const person = await getPersonById(session.personId);
  if (!person || !canRead(person.role, "program_analytics")) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const [
    teams,
    people,
    avgs,
    spent,
    caps,
    byFeature,
    books,
    sortQueue,
    calibration,
    activity,
    weekly,
  ] = await Promise.all([
    listTeams(),
    listPeopleFull(),
    teamReadinessAverages(),
    sumMonthlySpendUsd(),
    getSpendCaps(),
    spendByFeature(),
    listBookRequests(),
    listDriveSortQueue(),
    listCalibration(),
    listActivityLog(40),
    buildWeeklyEmailPreview(),
  ]);

  const names = new Map(people.map((p) => [p.id, p.name]));
  const techOnly = person.role === "tech_admin";

  return NextResponse.json({
    role: person.role,
    permissions: PERMISSION_TABLE,
    teams: teams.map((t) => {
      const a = avgs.find((x) => x.team_id === t.id);
      return {
        ...t,
        readiness: a?.avg ?? 0,
        deltaWeek: a?.delta_week ?? 0,
        members: people.filter((p) => p.team_id === t.id),
      };
    }),
    attendancePct: 86,
    consent: people.map((p) => ({
      id: p.id,
      name: p.name,
      team_id: p.team_id,
      role: p.role,
      consent_at: p.consent_at,
      recording_ok: p.recording_ok,
      voice_sample: Boolean(p.voice_sample_path),
      last_sign_in_at: p.last_sign_in_at,
    })),
    spend: techOnly
      ? {
          spent,
          caps,
          byFeature,
          alert80: spent / caps.monthly_usd >= 0.8,
          atCap: spent >= caps.monthly_usd,
        }
      : null,
    books: techOnly ? books : null,
    driveSortQueue: techOnly ? sortQueue : null,
    calibration: techOnly ? calibration : null,
    activity: {
      readOnly: person.role === "coach_admin",
      entries: activity.map((e) => ({
        ...e,
        personName: e.person_id ? names.get(e.person_id) ?? "unknown" : "system",
      })),
    },
    weekly: {
      optedIn: Boolean(person.digest_opt_in),
      email: person.email,
      preview: weekly,
      nextSend: "Sunday 6 pm Pacific",
    },
  });
}
