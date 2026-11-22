import "server-only";
import { createRequire } from "module";
import {
  deletePushSubscription,
  listPushSubscriptions,
} from "@/lib/db/supabase/notify-extra";
import { getVapidConfig } from "@/lib/notify/vapid";

export type PushPayload = {
  title: string;
  body?: string;
  href?: string | null;
  tag?: string;
};

type WebPush = {
  setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void;
  sendNotification: (
    subscription: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    },
    payload: string,
  ) => Promise<unknown>;
};

function loadWebPush(): WebPush {
  const require = createRequire(
    typeof __filename !== "undefined"
      ? __filename
      : `${process.cwd()}/src/lib/notify/push.ts`,
  );
  return require("web-push") as WebPush;
}

export async function sendWebPush(
  personId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  const vapid = getVapidConfig();
  if (!vapid) return { sent: 0, failed: 0 };

  const webpush = loadWebPush();
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  const subs = await listPushSubscriptions(personId);
  let sent = 0;
  let failed = 0;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify({
          title: payload.title,
          body: payload.body ?? "",
          href: payload.href ?? "/notifications",
          tag: payload.tag ?? "crux",
        }),
      );
      sent += 1;
    } catch (err) {
      failed += 1;
      const status =
        err && typeof err === "object" && "statusCode" in err
          ? Number((err as { statusCode: number }).statusCode)
          : 0;
      if (status === 404 || status === 410) {
        await deletePushSubscription(personId, sub.endpoint).catch(() => undefined);
      }
    }
  }
  return { sent, failed };
}
