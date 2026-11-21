import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canRead } from "@/lib/admin/permissions";
import { getPersonById } from "@/lib/db/repository";
import { getFlywheelDashboard } from "@/lib/db/supabase/flywheel-extra";

export const runtime = "nodejs";

/** Admin flywheel dashboard: edges, attacks, kappa, Brier, mastery. */
export async function GET() {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const person = await getPersonById(session.personId);
  if (!person || !canRead(person.role, "program_analytics")) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const dashboard = await getFlywheelDashboard();
  return NextResponse.json({
    ...dashboard,
    role: person.role,
  });
}
