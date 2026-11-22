import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getNotificationSettings,
  upsertNotificationSettings,
} from "@/lib/db/supabase/notify-extra";
import {
  DEFAULT_KIND_SETTINGS,
  NOTIFY_KINDS,
  type EmailChannel,
  type NotifyKind,
  type NotifyKindsSettings,
} from "@/lib/notify/kinds";
import { vapidConfigured } from "@/lib/notify/vapid";
import { logActivity } from "@/lib/db/repository";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const settings = await getNotificationSettings(session.personId);
  return NextResponse.json({
    settings,
    pushAvailable: vapidConfigured(),
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    push_enabled?: boolean;
    kinds?: Partial<
      Record<NotifyKind, { push?: boolean; email?: EmailChannel }>
    >;
    quiet_hours_start?: number | null;
    quiet_hours_end?: number | null;
  };

  const current = await getNotificationSettings(session.personId);
  let kinds: NotifyKindsSettings | undefined;
  if (body.kinds) {
    kinds = { ...DEFAULT_KIND_SETTINGS, ...current.kinds };
    for (const key of NOTIFY_KINDS) {
      const patch = body.kinds[key];
      if (!patch) continue;
      kinds[key] = {
        push: patch.push !== undefined ? Boolean(patch.push) : kinds[key].push,
        email:
          patch.email === "off" ||
          patch.email === "instant" ||
          patch.email === "digest"
            ? patch.email
            : kinds[key].email,
      };
    }
  }

  // Never enable push if VAPID is missing.
  let pushEnabled = body.push_enabled;
  if (pushEnabled === true && !vapidConfigured()) {
    pushEnabled = false;
  }

  const settings = await upsertNotificationSettings(session.personId, {
    push_enabled: pushEnabled,
    kinds,
    quiet_hours_start: body.quiet_hours_start,
    quiet_hours_end: body.quiet_hours_end,
  });

  await logActivity({
    person_id: session.personId,
    action: "notification_settings_saved",
    target: session.personId,
    meta: { push_enabled: settings.push_enabled },
  });

  return NextResponse.json({ settings, pushAvailable: vapidConfigured() });
}
