import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canRead } from "@/lib/admin/permissions";
import { getPersonById, listCalibration } from "@/lib/db/repository";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const person = await getPersonById(session.personId);
  if (!person || !canRead(person.role, "calibration")) {
    return NextResponse.json(
      { error: "Calibration is technical admin only. Members never see weights or gaps." },
      { status: 403 },
    );
  }
  const rows = await listCalibration();
  return NextResponse.json({
    rows,
    note: "Members never see weights or gaps.",
  });
}
