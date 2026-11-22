import "server-only";
import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import { readStore, updateStore } from "@/lib/db/sample-store";
import {
  DEFAULT_KIND_SETTINGS,
  NOTIFY_KINDS,
  type EmailChannel,
  type NotifyKind,
  type NotifyKindsSettings,
} from "@/lib/notify/kinds";
import type {
  CalmRoutineLog,
  NotificationSettings,
  PushSubscriptionRow,
} from "@/lib/notify/types";

function nowIso() {
  return new Date().toISOString();
}

function assertOk(error: { message: string } | null, label: string) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

function normalizeKinds(raw: unknown): NotifyKindsSettings {
  const base = { ...DEFAULT_KIND_SETTINGS };
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, { push?: boolean; email?: EmailChannel }>;
  for (const kind of NOTIFY_KINDS) {
    const row = obj[kind];
    if (!row) continue;
    const email: EmailChannel =
      row.email === "instant" || row.email === "digest" || row.email === "off"
        ? row.email
        : base[kind].email;
    base[kind] = {
      push: row.push !== false,
      email,
    };
  }
  return base;
}

function defaultSettings(personId: string): NotificationSettings {
  return {
    person_id: personId,
    push_enabled: false,
    kinds: { ...DEFAULT_KIND_SETTINGS },
    quiet_hours_start: null,
    quiet_hours_end: null,
    updated_at: nowIso(),
  };
}

type SampleBags = {
  notification_settings?: NotificationSettings[];
  push_subscriptions?: PushSubscriptionRow[];
  notification_email_queue?: {
    id: string;
    person_id: string;
    notification_id: string;
    kind: string;
    created_at: string;
    sent_at: string | null;
  }[];
  calm_routine_logs?: CalmRoutineLog[];
};

export async function getNotificationSettings(
  personId: string,
): Promise<NotificationSettings> {
  if (isSampleDataMode()) {
    const store = (await readStore()) as SampleBags;
    const row = store.notification_settings?.find((s) => s.person_id === personId);
    return row
      ? { ...row, kinds: normalizeKinds(row.kinds) }
      : defaultSettings(personId);
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("notification_settings")
    .select("*")
    .eq("person_id", personId)
    .maybeSingle();
  assertOk(error, "getNotificationSettings");
  if (!data) return defaultSettings(personId);
  return {
    person_id: data.person_id as string,
    push_enabled: Boolean(data.push_enabled),
    kinds: normalizeKinds(data.kinds),
    quiet_hours_start:
      data.quiet_hours_start == null ? null : Number(data.quiet_hours_start),
    quiet_hours_end:
      data.quiet_hours_end == null ? null : Number(data.quiet_hours_end),
    updated_at: data.updated_at as string,
  };
}

export async function upsertNotificationSettings(
  personId: string,
  patch: Partial<{
    push_enabled: boolean;
    kinds: NotifyKindsSettings;
    quiet_hours_start: number | null;
    quiet_hours_end: number | null;
  }>,
): Promise<NotificationSettings> {
  const current = await getNotificationSettings(personId);
  const next: NotificationSettings = {
    ...current,
    push_enabled:
      patch.push_enabled !== undefined ? patch.push_enabled : current.push_enabled,
    kinds: patch.kinds ? normalizeKinds(patch.kinds) : current.kinds,
    quiet_hours_start:
      patch.quiet_hours_start !== undefined
        ? patch.quiet_hours_start
        : current.quiet_hours_start,
    quiet_hours_end:
      patch.quiet_hours_end !== undefined
        ? patch.quiet_hours_end
        : current.quiet_hours_end,
    updated_at: nowIso(),
  };

  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = s as SampleBags;
      if (!bag.notification_settings) bag.notification_settings = [];
      const i = bag.notification_settings.findIndex(
        (r) => r.person_id === personId,
      );
      if (i >= 0) bag.notification_settings[i] = next;
      else bag.notification_settings.push(next);
    });
    return next;
  }

  const sb = getServiceSupabase();
  const { error } = await sb.from("notification_settings").upsert({
    person_id: next.person_id,
    push_enabled: next.push_enabled,
    kinds: next.kinds,
    quiet_hours_start: next.quiet_hours_start,
    quiet_hours_end: next.quiet_hours_end,
    updated_at: next.updated_at,
  });
  assertOk(error, "upsertNotificationSettings");
  return next;
}

export async function savePushSubscription(input: {
  personId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}): Promise<PushSubscriptionRow> {
  const row: PushSubscriptionRow = {
    id: randomUUID(),
    person_id: input.personId,
    endpoint: input.endpoint,
    p256dh: input.p256dh,
    auth: input.auth,
    user_agent: input.userAgent ?? null,
    created_at: nowIso(),
  };
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = s as SampleBags;
      if (!bag.push_subscriptions) bag.push_subscriptions = [];
      const i = bag.push_subscriptions.findIndex(
        (r) => r.endpoint === row.endpoint,
      );
      if (i >= 0) {
        bag.push_subscriptions[i] = {
          ...row,
          id: bag.push_subscriptions[i]!.id,
        };
      } else {
        bag.push_subscriptions.push(row);
      }
    });
    return row;
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("push_subscriptions")
    .upsert(
      {
        person_id: row.person_id,
        endpoint: row.endpoint,
        p256dh: row.p256dh,
        auth: row.auth,
        user_agent: row.user_agent,
      },
      { onConflict: "endpoint" },
    )
    .select("*")
    .single();
  assertOk(error, "savePushSubscription");
  return data as PushSubscriptionRow;
}

export async function deletePushSubscription(
  personId: string,
  endpoint: string,
): Promise<void> {
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = s as SampleBags;
      bag.push_subscriptions = (bag.push_subscriptions ?? []).filter(
        (r) => !(r.person_id === personId && r.endpoint === endpoint),
      );
    });
    return;
  }
  const sb = getServiceSupabase();
  const { error } = await sb
    .from("push_subscriptions")
    .delete()
    .eq("person_id", personId)
    .eq("endpoint", endpoint);
  assertOk(error, "deletePushSubscription");
}

export async function listPushSubscriptions(
  personId: string,
): Promise<PushSubscriptionRow[]> {
  if (isSampleDataMode()) {
    const store = (await readStore()) as SampleBags;
    return (store.push_subscriptions ?? []).filter(
      (r) => r.person_id === personId,
    );
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("push_subscriptions")
    .select("*")
    .eq("person_id", personId);
  assertOk(error, "listPushSubscriptions");
  return (data ?? []) as PushSubscriptionRow[];
}

export async function enqueueDigestEmail(input: {
  personId: string;
  notificationId: string;
  kind: NotifyKind;
}): Promise<void> {
  const row = {
    id: randomUUID(),
    person_id: input.personId,
    notification_id: input.notificationId,
    kind: input.kind,
    created_at: nowIso(),
    sent_at: null as string | null,
  };
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = s as SampleBags;
      if (!bag.notification_email_queue) bag.notification_email_queue = [];
      bag.notification_email_queue.push(row);
    });
    return;
  }
  const sb = getServiceSupabase();
  const { error } = await sb.from("notification_email_queue").insert(row);
  assertOk(error, "enqueueDigestEmail");
}

export async function listPendingDigest(
  personId?: string,
): Promise<
  {
    id: string;
    person_id: string;
    notification_id: string;
    kind: string;
    created_at: string;
  }[]
> {
  if (isSampleDataMode()) {
    const store = (await readStore()) as SampleBags;
    return (store.notification_email_queue ?? [])
      .filter((r) => !r.sent_at)
      .filter((r) => (personId ? r.person_id === personId : true));
  }
  const sb = getServiceSupabase();
  let q = sb
    .from("notification_email_queue")
    .select("id, person_id, notification_id, kind, created_at")
    .is("sent_at", null)
    .order("created_at", { ascending: true });
  if (personId) q = q.eq("person_id", personId);
  const { data, error } = await q;
  assertOk(error, "listPendingDigest");
  return (data ?? []) as {
    id: string;
    person_id: string;
    notification_id: string;
    kind: string;
    created_at: string;
  }[];
}

export async function markDigestSent(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const at = nowIso();
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = s as SampleBags;
      for (const row of bag.notification_email_queue ?? []) {
        if (ids.includes(row.id)) row.sent_at = at;
      }
    });
    return;
  }
  const sb = getServiceSupabase();
  const { error } = await sb
    .from("notification_email_queue")
    .update({ sent_at: at })
    .in("id", ids);
  assertOk(error, "markDigestSent");
}

export async function markAllNotificationsRead(
  personId: string,
): Promise<number> {
  if (isSampleDataMode()) {
    let n = 0;
    await updateStore((s) => {
      const rows =
        (s as { notifications?: { person_id: string; read_at: string | null }[] })
          .notifications ?? [];
      for (const row of rows) {
        if (row.person_id === personId && !row.read_at) {
          row.read_at = nowIso();
          n += 1;
        }
      }
    });
    return n;
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("notifications")
    .update({ read_at: nowIso() })
    .eq("person_id", personId)
    .is("read_at", null)
    .select("id");
  assertOk(error, "markAllNotificationsRead");
  return (data ?? []).length;
}

export async function logCalmRoutine(input: {
  personId: string;
  roundId?: string | null;
  caseId?: string | null;
  completed: boolean;
  skipped: boolean;
}): Promise<CalmRoutineLog> {
  const row: CalmRoutineLog = {
    id: randomUUID(),
    person_id: input.personId,
    round_id: input.roundId ?? null,
    case_id: input.caseId ?? null,
    completed: input.completed,
    skipped: input.skipped,
    created_at: nowIso(),
  };
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = s as SampleBags;
      if (!bag.calm_routine_logs) bag.calm_routine_logs = [];
      bag.calm_routine_logs.push(row);
    });
    return row;
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("calm_routine_logs")
    .insert({
      id: row.id,
      person_id: row.person_id,
      round_id: row.round_id,
      case_id: row.case_id,
      completed: row.completed,
      skipped: row.skipped,
    })
    .select("*")
    .single();
  assertOk(error, "logCalmRoutine");
  return data as CalmRoutineLog;
}

export async function listPeopleWithEmail(): Promise<
  { id: string; email: string; name: string }[]
> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const people = (store as { people?: { id: string; email: string | null; name: string }[] })
      .people ?? [];
    return people
      .filter((p) => p.email && p.email.includes("@"))
      .map((p) => ({ id: p.id, email: p.email!, name: p.name }));
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("people")
    .select("id, email, name")
    .not("email", "is", null);
  assertOk(error, "listPeopleWithEmail");
  return ((data ?? []) as { id: string; email: string | null; name: string }[])
    .filter((p) => p.email && p.email.includes("@"))
    .map((p) => ({ id: p.id, email: p.email!, name: p.name }));
}
