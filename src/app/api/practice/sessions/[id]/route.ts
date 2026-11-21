import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getSessionById,
  listAttendance,
  rotateSessionCode,
} from "@/lib/db/practice-repository";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const row = await getSessionById(id);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const admin =
    session.adminView &&
    (session.role === "tech_admin" || session.role === "coach_admin");
  const attendance = await listAttendance(id);
  return NextResponse.json({
    session: {
      ...row,
      code_hash: admin ? row.code_hash : undefined,
    },
    attendance,
    admin,
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin =
    session.adminView &&
    (session.role === "tech_admin" || session.role === "coach_admin");
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = (await req.json()) as { action?: string };
  if (body.action === "rotate_code") {
    const code = await rotateSessionCode(id, session.personId);
    return NextResponse.json({ code });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
