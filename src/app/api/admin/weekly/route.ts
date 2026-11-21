import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canRead } from "@/lib/admin/permissions";
import {
  buildWeeklyEmailPreview,
  getPersonById,
  setDigestOptIn,
  logActivity,
} from "@/lib/db/repository";
import { sendWeeklySummaryEmail } from "@/lib/email/weekly-summary";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const person = await getPersonById(session.personId);
  if (!person || !canRead(person.role, "weekly_summary")) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const preview = await buildWeeklyEmailPreview();
  return NextResponse.json({
    digestOptIn: person.digest_opt_in,
    email: person.email,
    preview,
    nextSend: "Sunday 6 pm Pacific",
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const person = await getPersonById(session.personId);
  if (!person || !canRead(person.role, "weekly_summary")) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = (await req.json()) as {
    action?: "preview" | "opt_in" | "opt_out" | "send_now";
    digestOptIn?: boolean;
  };

  if (body.action === "opt_in" || body.digestOptIn === true) {
    if (!person.email) {
      return NextResponse.json(
        { error: "Add an email in Settings before opting in." },
        { status: 400 },
      );
    }
    await setDigestOptIn(person.id, true);
    await logActivity({
      person_id: person.id,
      action: "digest_opt_in",
      target: person.id,
    });
    return NextResponse.json({ ok: true, digestOptIn: true });
  }

  if (body.action === "opt_out" || body.digestOptIn === false) {
    await setDigestOptIn(person.id, false);
    await logActivity({
      person_id: person.id,
      action: "digest_opt_out",
      target: person.id,
    });
    return NextResponse.json({ ok: true, digestOptIn: false });
  }

  if (body.action === "send_now") {
    // Preview / force send for admins; still only delivers to opted-in recipients
    const result = await sendWeeklySummaryEmail({ force: true });
    return NextResponse.json(result);
  }

  const preview = await buildWeeklyEmailPreview();
  return NextResponse.json({ preview });
}
