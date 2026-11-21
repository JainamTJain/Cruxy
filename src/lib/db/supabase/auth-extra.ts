import "server-only";
import { randomUUID } from "crypto";
import { assertOk, getServiceSupabase } from "@/lib/db/supabase/client";
import { isSampleDataMode } from "@/lib/db/config";
import { logActivity, getPersonById, savePerson } from "@/lib/db/repository";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { nowIso } from "@/lib/utils";
import type {
  AppNotification,
  Person,
  TeamMembership,
} from "@/lib/types";

/** Read people.session_version without changing foundation mapPerson. */
export async function getPersonSessionVersion(
  personId: string,
): Promise<number> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const p = store.people.find((x) => x.id === personId);
    return p?.session_version ?? 0;
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("people")
    .select("session_version")
    .eq("id", personId)
    .maybeSingle();
  assertOk(error, "getPersonSessionVersion");
  return (data?.session_version as number | undefined) ?? 0;
}

/** Bump session_version so every JWT for this person becomes invalid. */
export async function bumpSessionVersion(personId: string): Promise<number> {
  if (isSampleDataMode()) {
    let next = 1;
    await updateStore((s) => {
      const p = s.people.find((x) => x.id === personId);
      if (p) {
        next = (p.session_version ?? 0) + 1;
        p.session_version = next;
      }
    });
    return next;
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("people")
    .select("session_version")
    .eq("id", personId)
    .maybeSingle();
  assertOk(error, "bumpSessionVersion.read");
  const next = ((data?.session_version as number | undefined) ?? 0) + 1;
  const { error: upErr } = await sb
    .from("people")
    .update({ session_version: next })
    .eq("id", personId);
  assertOk(upErr, "bumpSessionVersion.bump");
  return next;
}

export async function listTeamMemberships(
  personId: string,
): Promise<TeamMembership[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const rows = (store as { team_memberships?: TeamMembership[] })
      .team_memberships;
    return (rows ?? []).filter((r) => r.person_id === personId);
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("team_memberships")
    .select("*")
    .eq("person_id", personId)
    .order("from_at", { ascending: false });
  assertOk(error, "listTeamMemberships");
  return (data ?? []) as TeamMembership[];
}

/**
 * Admin-only team change. History keeps the old team on closed memberships;
 * a DB trigger also syncs on people.team_id update in Supabase mode.
 */
export async function setTeamMembership(opts: {
  actorId: string;
  personId: string;
  teamId: string | null;
}): Promise<Person> {
  const person = await getPersonById(opts.personId);
  if (!person) throw new Error("Person not found");
  const fromTeam = person.team_id;
  person.team_id = opts.teamId;
  await savePerson(person);

  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = s as {
        team_memberships?: TeamMembership[];
      };
      if (!bag.team_memberships) bag.team_memberships = [];
      const open = bag.team_memberships.find(
        (m) => m.person_id === opts.personId && !m.to_at,
      );
      if (open) open.to_at = nowIso();
      if (opts.teamId) {
        bag.team_memberships.push({
          id: randomUUID(),
          person_id: opts.personId,
          team_id: opts.teamId,
          from_at: nowIso(),
          to_at: null,
          created_at: nowIso(),
          created_by: opts.actorId,
        });
      }
    });
  }

  await logActivity({
    person_id: opts.actorId,
    action: "team_membership_changed",
    target: opts.personId,
    meta: { from: fromTeam, to: opts.teamId },
  });
  return person;
}

export async function setTeamChampion(opts: {
  actorId: string;
  teamId: string;
  championPersonId: string | null;
}): Promise<void> {
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const t = s.teams.find((x) => x.id === opts.teamId);
      if (t) {
        (t as { champion_person_id?: string | null }).champion_person_id =
          opts.championPersonId;
      }
    });
  } else {
    const sb = getServiceSupabase();
    const { error } = await sb
      .from("teams")
      .update({ champion_person_id: opts.championPersonId })
      .eq("id", opts.teamId);
    assertOk(error, "setTeamChampion");
  }
  await logActivity({
    person_id: opts.actorId,
    action: "team_champion_set",
    target: opts.teamId,
    meta: { champion_person_id: opts.championPersonId },
  });
}

export async function getTeamChampion(
  teamId: string,
): Promise<string | null> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const t = store.teams.find((x) => x.id === teamId);
    return (
      (t as { champion_person_id?: string | null } | undefined)
        ?.champion_person_id ?? null
    );
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("teams")
    .select("champion_person_id")
    .eq("id", teamId)
    .maybeSingle();
  assertOk(error, "getTeamChampion");
  return (data?.champion_person_id as string | null | undefined) ?? null;
}

export async function createNotification(input: {
  personId: string;
  kind: string;
  title: string;
  body?: string | null;
  href?: string | null;
  payload?: Record<string, unknown>;
  createdBy?: string | null;
}): Promise<AppNotification> {
  const row: AppNotification = {
    id: randomUUID(),
    person_id: input.personId,
    kind: input.kind,
    title: input.title,
    body: input.body ?? null,
    href: input.href ?? null,
    payload: input.payload ?? {},
    read_at: null,
    created_at: nowIso(),
    created_by: input.createdBy ?? null,
  };
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = s as { notifications?: AppNotification[] };
      if (!bag.notifications) bag.notifications = [];
      bag.notifications.push(row);
    });
    return row;
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("notifications")
    .insert({
      id: row.id,
      person_id: row.person_id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      href: row.href,
      payload: row.payload,
      created_by: row.created_by,
    })
    .select("*")
    .single();
  assertOk(error, "createNotification");
  return data as AppNotification;
}

export async function listNotifications(
  personId: string,
  opts?: { unreadOnly?: boolean },
): Promise<AppNotification[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const rows =
      (store as { notifications?: AppNotification[] }).notifications ?? [];
    return rows
      .filter((n) => n.person_id === personId)
      .filter((n) => (opts?.unreadOnly ? !n.read_at : true))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  const sb = getServiceSupabase();
  let q = sb
    .from("notifications")
    .select("*")
    .eq("person_id", personId)
    .order("created_at", { ascending: false });
  if (opts?.unreadOnly) q = q.is("read_at", null);
  const { data, error } = await q;
  assertOk(error, "listNotifications");
  return (data ?? []) as AppNotification[];
}

export async function markNotificationRead(
  personId: string,
  notificationId: string,
): Promise<void> {
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const rows =
        (s as { notifications?: AppNotification[] }).notifications ?? [];
      const n = rows.find(
        (x) => x.id === notificationId && x.person_id === personId,
      );
      if (n) n.read_at = nowIso();
    });
    return;
  }
  const sb = getServiceSupabase();
  const { error } = await sb
    .from("notifications")
    .update({ read_at: nowIso() })
    .eq("id", notificationId)
    .eq("person_id", personId);
  assertOk(error, "markNotificationRead");
}

export async function markDigestPrompted(personId: string): Promise<void> {
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const p = s.people.find((x) => x.id === personId);
      if (p) p.digest_prompted_at = nowIso();
    });
    return;
  }
  const sb = getServiceSupabase();
  const { error } = await sb
    .from("people")
    .update({ digest_prompted_at: nowIso() })
    .eq("id", personId);
  assertOk(error, "markDigestPrompted");
}

export async function markFirstRunComplete(personId: string): Promise<void> {
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const p = s.people.find((x) => x.id === personId);
      if (p) p.first_run_completed_at = nowIso();
    });
    return;
  }
  const sb = getServiceSupabase();
  const { error } = await sb
    .from("people")
    .update({ first_run_completed_at: nowIso() })
    .eq("id", personId);
  assertOk(error, "markFirstRunComplete");
}

/** Sample-store helpers: team_memberships / notifications bags live on the store. */
export async function ensureSampleMembershipBackfill(): Promise<void> {
  if (!isSampleDataMode()) return;
  await updateStore((s) => {
    const bag = s as { team_memberships?: TeamMembership[] };
    if (!bag.team_memberships) bag.team_memberships = [];
    for (const p of s.people) {
      if (!p.team_id) continue;
      const open = bag.team_memberships.find(
        (m) => m.person_id === p.id && !m.to_at,
      );
      if (!open) {
        bag.team_memberships.push({
          id: randomUUID(),
          person_id: p.id,
          team_id: p.team_id,
          from_at: p.created_at,
          to_at: null,
          created_at: p.created_at,
          created_by: null,
        });
      }
    }
  });
}
