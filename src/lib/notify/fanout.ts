import "server-only";
import { sendOpsEmail } from "@/lib/ops/email";
import {
  enqueueDigestEmail,
  getNotificationSettings,
  listPeopleWithEmail,
} from "@/lib/db/supabase/notify-extra";
import { getPersonById } from "@/lib/db/repository";
import { bucketForStoredKind, type NotifyKind } from "@/lib/notify/kinds";
import { sendWebPush } from "@/lib/notify/push";
import { isInQuietHours } from "@/lib/notify/quiet-hours";
import type { AppNotification } from "@/lib/types";

/**
 * After an in-app notification is saved, optionally push and/or email
 * based on the person's settings. Quiet hours suppress push and instant
 * email; digest items still queue.
 */
export async function fanOutNotification(
  note: AppNotification,
): Promise<void> {
  const bucket = bucketForStoredKind(note.kind);
  if (!bucket) return;

  const settings = await getNotificationSettings(note.person_id);
  const channels = settings.kinds[bucket];
  const quiet = isInQuietHours(
    new Date(),
    settings.quiet_hours_start,
    settings.quiet_hours_end,
  );

  if (settings.push_enabled && channels.push && !quiet) {
    await sendWebPush(note.person_id, {
      title: note.title,
      body: note.body ?? undefined,
      href: note.href,
      tag: bucket,
    }).catch(() => undefined);
  }

  if (channels.email === "off") return;

  if (channels.email === "digest") {
    await enqueueDigestEmail({
      personId: note.person_id,
      notificationId: note.id,
      kind: bucket,
    }).catch(() => undefined);
    return;
  }

  // instant
  if (quiet) {
    await enqueueDigestEmail({
      personId: note.person_id,
      notificationId: note.id,
      kind: bucket,
    }).catch(() => undefined);
    return;
  }

  await sendInstantEmail(note, bucket).catch(() => undefined);
}

async function sendInstantEmail(
  note: AppNotification,
  kind: NotifyKind,
): Promise<void> {
  const person = await getPersonById(note.person_id);
  if (!person) return;
  const email = person.email?.trim();
  if (!email || !email.includes("@")) return;
  if (person.email_reminders_opt_in === false) return;

  const link = note.href
    ? `Open in Crux: ${absoluteHref(note.href)}`
    : "Open Crux to read more.";

  await sendOpsEmail({
    to: email,
    subject: note.title,
    text: [note.body ?? note.title, "", link].join("\n"),
    action: "notify_instant",
    meta: { kind, notification_id: note.id, person_id: note.person_id },
  });
}

function absoluteHref(href: string): string {
  if (href.startsWith("http")) return href;
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (prod ? `https://${prod}` : "https://cruxy.vercel.app");
  return `${base.replace(/\/$/, "")}${href.startsWith("/") ? href : `/${href}`}`;
}

export async function createReachNotification(input: {
  personId: string;
  kind: string;
  title: string;
  body?: string | null;
  href?: string | null;
  payload?: Record<string, unknown>;
  createdBy?: string | null;
}): Promise<AppNotification> {
  // Lazy import avoids circular deps with auth-extra.
  const { createNotification } = await import("@/lib/db/supabase/auth-extra");
  return createNotification(input);
}

/** Used by digest cron to resolve people with queued items. */
export { listPeopleWithEmail };
