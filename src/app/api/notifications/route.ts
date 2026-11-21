import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  listNotifications,
  markNotificationRead,
} from "@/lib/db/supabase/auth-extra";

export const runtime = "nodejs";

/** In-app bell feed (F-074). */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const unreadOnly = new URL(req.url).searchParams.get("unread") === "1";
  const notifications = await listNotifications(session.personId, {
    unreadOnly,
  });
  return NextResponse.json({
    notifications,
    unread: notifications.filter((n) => !n.read_at).length,
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as { id?: string };
  if (!body.id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  await markNotificationRead(session.personId, body.id);
  return NextResponse.json({ ok: true });
}
