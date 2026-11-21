import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import { isSampleDataMode, supabaseConfigured } from "@/lib/db/config";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }
  const person = await getPersonById(session.personId);
  return NextResponse.json({
    authenticated: true,
    session,
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
          email: person.email,
        }
      : null,
    dataMode: isSampleDataMode() ? "sample" : "supabase",
    supabaseConfigured: supabaseConfigured(),
  });
}
