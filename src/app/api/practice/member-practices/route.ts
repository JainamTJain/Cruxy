import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listRecentMemberPractices } from "@/lib/practice/wave5";

/** F-204: admins see member-started practices. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin =
    session.adminView &&
    (session.role === "tech_admin" || session.role === "coach_admin");
  if (!admin) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const practices = await listRecentMemberPractices();
  return NextResponse.json({ practices });
}
