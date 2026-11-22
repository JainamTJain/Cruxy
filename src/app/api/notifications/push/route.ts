import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  deletePushSubscription,
  savePushSubscription,
  upsertNotificationSettings,
} from "@/lib/db/supabase/notify-extra";
import { getVapidConfig, vapidConfigured } from "@/lib/notify/vapid";
import { logActivity } from "@/lib/db/repository";

export const runtime = "nodejs";

/** Public key for the browser Subscribe call. Empty when unset. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const vapid = getVapidConfig();
  return NextResponse.json({
    configured: Boolean(vapid),
    publicKey: vapid?.publicKey ?? null,
  });
}

/** Save a PushSubscription after the person taps Turn on alerts. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!vapidConfigured()) {
    return NextResponse.json(
      { error: "Push is not configured yet." },
      { status: 503 },
    );
  }
  const body = (await req.json()) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }
  await savePushSubscription({
    personId: session.personId,
    endpoint: body.endpoint,
    p256dh: body.keys.p256dh,
    auth: body.keys.auth,
    userAgent: req.headers.get("user-agent"),
  });
  await upsertNotificationSettings(session.personId, { push_enabled: true });
  await logActivity({
    person_id: session.personId,
    action: "push_subscribed",
    target: session.personId,
    meta: {},
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (body.endpoint) {
    await deletePushSubscription(session.personId, body.endpoint);
  }
  await upsertNotificationSettings(session.personId, { push_enabled: false });
  await logActivity({
    person_id: session.personId,
    action: "push_unsubscribed",
    target: session.personId,
    meta: {},
  });
  return NextResponse.json({ ok: true });
}
