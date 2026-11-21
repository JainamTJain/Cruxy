import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import { effectiveRole } from "@/lib/db/repository";
import { isSampleDataMode, supabaseConfigured } from "@/lib/db/config";
import {
  canOpenPasscodesPanel,
  canSeeSessionCodes,
  canTakeAttendance,
  viewingAsMember,
  ROLE_SUMMARY,
} from "@/lib/auth/capabilities";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }
  const person = await getPersonById(session.personId);
  const viewRole = person
    ? effectiveRole(person, session.adminView)
    : session.role;
  return NextResponse.json({
    authenticated: true,
    session,
    effectiveRole: viewRole,
    viewingAsMember: viewingAsMember(session),
    capabilities: person
      ? {
          passcodes: canOpenPasscodesPanel(person, session),
          sessionCodes: canSeeSessionCodes(person, session),
          attendance: canTakeAttendance(person, session),
          roleSummary: ROLE_SUMMARY[viewRole === "member" ? "member" : person.role],
        }
      : null,
    person: person
      ? {
          id: person.id,
          name: person.name,
          role: person.role,
          team_id: person.team_id,
          consent_version: person.consent_version,
          recording_ok: person.recording_ok,
          first_run_checklist: person.first_run_checklist,
          email_reminders_opt_in: person.email_reminders_opt_in,
          digest_opt_in: person.digest_opt_in,
          email: person.email,
          digest_prompted_at: person.digest_prompted_at ?? null,
          first_run_completed_at: person.first_run_completed_at ?? null,
        }
      : null,
    dataMode: isSampleDataMode() ? "sample" : "supabase",
    supabaseConfigured: supabaseConfigured(),
  });
}
