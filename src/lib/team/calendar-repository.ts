/**
 * Wave 9 E: team calendar, availability polls, kudos, calendar feed tokens.
 */
import "server-only";
import { createHash, randomBytes, randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { createNotification } from "@/lib/db/supabase/auth-extra";
import { logActivity } from "@/lib/db/repository";
import { listSessions } from "@/lib/db/practice-repository";
import { readStore, updateStore } from "@/lib/db/sample-store";
import type {
  AvailabilityPoll,
  AvailabilityPollVote,
  AvailabilitySlot,
  PeerKudos,
  TeamEvent,
  TeamEventKind,
} from "@/lib/team/calendar-types";
import { nowIso } from "@/lib/utils";

type StoreBag = {
  team_events?: TeamEvent[];
  availability_polls?: AvailabilityPoll[];
  availability_poll_votes?: AvailabilityPollVote[];
  peer_kudos?: PeerKudos[];
  calendar_feed_tokens?: { person_id: string; token: string; created_at: string; rotated_at: string }[];
};

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function ensureCalendarToken(personId: string): Promise<string> {
  if (isSampleDataMode()) {
    let token = "";
    await updateStore((s) => {
      const bag = ((s as StoreBag).calendar_feed_tokens ??= []);
      const hit = bag.find((t) => t.person_id === personId);
      if (hit) {
        token = hit.token;
        return;
      }
      token = newToken();
      bag.push({
        person_id: personId,
        token,
        created_at: nowIso(),
        rotated_at: nowIso(),
      });
    });
    return token;
  }
  const { getServiceSupabase } = await import("@/lib/db/supabase/client");
  const sb = getServiceSupabase();
  const { data: existing } = await sb
    .from("calendar_feed_tokens")
    .select("token")
    .eq("person_id", personId)
    .maybeSingle();
  if (existing?.token) return existing.token as string;
  const token = newToken();
  await sb.from("calendar_feed_tokens").upsert({
    person_id: personId,
    token,
    created_at: nowIso(),
    rotated_at: nowIso(),
  });
  return token;
}

export async function rotateCalendarToken(personId: string): Promise<string> {
  const token = newToken();
  const stamp = nowIso();
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = ((s as StoreBag).calendar_feed_tokens ??= []);
      const i = bag.findIndex((t) => t.person_id === personId);
      const row = {
        person_id: personId,
        token,
        created_at: i >= 0 ? bag[i]!.created_at : stamp,
        rotated_at: stamp,
      };
      if (i >= 0) bag[i] = row;
      else bag.push(row);
    });
    return token;
  }
  const { getServiceSupabase } = await import("@/lib/db/supabase/client");
  await getServiceSupabase().from("calendar_feed_tokens").upsert({
    person_id: personId,
    token,
    rotated_at: stamp,
  });
  return token;
}

export async function personIdForCalendarToken(
  token: string,
): Promise<string | null> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const hit = ((store as StoreBag).calendar_feed_tokens ?? []).find(
      (t) => t.token === token,
    );
    return hit?.person_id ?? null;
  }
  const { getServiceSupabase } = await import("@/lib/db/supabase/client");
  const { data } = await getServiceSupabase()
    .from("calendar_feed_tokens")
    .select("person_id")
    .eq("token", token)
    .maybeSingle();
  return (data?.person_id as string | undefined) ?? null;
}

async function listStoredEvents(teamId: string): Promise<TeamEvent[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return ((store as StoreBag).team_events ?? [])
      .filter((e) => e.team_id === teamId)
      .map((e) => ({ ...e, source: "team" as const }));
  }
  const { getServiceSupabase } = await import("@/lib/db/supabase/client");
  const { data, error } = await getServiceSupabase()
    .from("team_events")
    .select("*")
    .eq("team_id", teamId)
    .order("starts_at", { ascending: true });
  if (error) return [];
  return ((data ?? []) as TeamEvent[]).map((e) => ({ ...e, source: "team" }));
}

async function virtualEvents(teamId: string): Promise<TeamEvent[]> {
  const out: TeamEvent[] = [];
  try {
    const sessions = await listSessions({ admin: true });
    for (const s of sessions) {
      if (
        s.invite_team_ids?.length &&
        !s.invite_team_ids.includes(teamId)
      ) {
        continue;
      }
      const starts = s.date.includes("T")
        ? s.date
        : `${s.date}T18:00:00.000Z`;
      out.push({
        id: `session:${s.id}`,
        team_id: teamId,
        title: s.title || "Practice session",
        kind: "practice",
        starts_at: starts,
        ends_at: null,
        place: s.place,
        online: s.online,
        body: null,
        practice_session_id: s.id,
        created_by: s.created_by,
        created_at: s.created_at,
        source: "session",
      });
    }
  } catch {
    // ignore
  }

  // Dec 5 regional
  out.push({
    id: `competition:regionals-2026:${teamId}`,
    team_id: teamId,
    title: "California Regional (UCSB)",
    kind: "deadline",
    starts_at: "2026-12-05",
    ends_at: null,
    place: "UC Santa Barbara",
    online: false,
    body: "APPE California Regional.",
    practice_session_id: null,
    created_by: null,
    created_at: "2026-11-01T00:00:00.000Z",
    source: "competition",
  });

  return out;
}

export async function listTeamCalendar(teamId: string): Promise<TeamEvent[]> {
  const [stored, virtual] = await Promise.all([
    listStoredEvents(teamId),
    virtualEvents(teamId),
  ]);
  // Prefer stored events that already link a session; drop duplicate virtual
  const linkedSessions = new Set(
    stored.map((e) => e.practice_session_id).filter(Boolean),
  );
  const merged = [
    ...stored,
    ...virtual.filter(
      (v) =>
        v.source !== "session" ||
        !linkedSessions.has(v.practice_session_id),
    ),
  ];
  return merged.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

export async function createTeamEvent(input: {
  teamId: string;
  title: string;
  kind: TeamEventKind;
  startsAt: string;
  endsAt?: string | null;
  place?: string | null;
  online?: boolean;
  body?: string | null;
  practiceSessionId?: string | null;
  actorId: string;
}): Promise<TeamEvent> {
  const row: TeamEvent = {
    id: randomUUID(),
    team_id: input.teamId,
    title: input.title.trim(),
    kind: input.kind,
    starts_at: input.startsAt,
    ends_at: input.endsAt ?? null,
    place: input.place ?? null,
    online: Boolean(input.online),
    body: input.body ?? null,
    practice_session_id: input.practiceSessionId ?? null,
    created_by: input.actorId,
    created_at: nowIso(),
    source: "team",
  };

  if (isSampleDataMode()) {
    await updateStore((s) => {
      ((s as StoreBag).team_events ??= []).push(row);
    });
  } else {
    const { getServiceSupabase } = await import("@/lib/db/supabase/client");
    const { data, error } = await getServiceSupabase()
      .from("team_events")
      .insert({
        id: row.id,
        team_id: row.team_id,
        title: row.title,
        kind: row.kind,
        starts_at: row.starts_at,
        ends_at: row.ends_at,
        place: row.place,
        online: row.online,
        body: row.body,
        practice_session_id: row.practice_session_id,
        created_by: row.created_by,
        created_at: row.created_at,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    Object.assign(row, data);
    row.source = "team";
  }

  await logActivity({
    person_id: input.actorId,
    action: "team_event_created",
    target: row.id,
    meta: { team_id: input.teamId, title: row.title },
  });

  // Notify teammates
  try {
    let people: { id: string; name: string }[] = [];
    if (isSampleDataMode()) {
      const store = await readStore();
      people = store.people
        .filter((p) => p.team_id === input.teamId)
        .map((p) => ({ id: p.id, name: p.name }));
    } else {
      const { getServiceSupabase } = await import("@/lib/db/supabase/client");
      const { data } = await getServiceSupabase()
        .from("people")
        .select("id,name")
        .eq("team_id", input.teamId);
      people = (data ?? []).map((p) => ({
        id: p.id as string,
        name: p.name as string,
      }));
    }
    for (const p of people) {
      if (p.id === input.actorId) continue;
      await createNotification({
        personId: p.id,
        kind: "team_event",
        title: "New team event",
        body: row.title,
        href: "/team/calendar",
        payload: { event_id: row.id },
        createdBy: input.actorId,
      });
    }
  } catch {
    // ignore
  }

  return row;
}

export async function listPolls(teamId: string): Promise<
  (AvailabilityPoll & {
    votes: AvailabilityPollVote[];
    tallies: { slotId: string; count: number }[];
    bestSlotId: string | null;
  })[]
> {
  let polls: AvailabilityPoll[] = [];
  let votes: AvailabilityPollVote[] = [];

  if (isSampleDataMode()) {
    const store = await readStore();
    polls = ((store as StoreBag).availability_polls ?? []).filter(
      (p) => p.team_id === teamId,
    );
    votes = ((store as StoreBag).availability_poll_votes ?? []).filter((v) =>
      polls.some((p) => p.id === v.poll_id),
    );
  } else {
    const { getServiceSupabase } = await import("@/lib/db/supabase/client");
    const sb = getServiceSupabase();
    const { data: pollRows } = await sb
      .from("availability_polls")
      .select("*")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });
    polls = ((pollRows ?? []) as AvailabilityPoll[]).map((p) => ({
      ...p,
      slots: (p.slots as AvailabilitySlot[]) ?? [],
    }));
    if (polls.length) {
      const { data: voteRows } = await sb
        .from("availability_poll_votes")
        .select("*")
        .in(
          "poll_id",
          polls.map((p) => p.id),
        );
      votes = ((voteRows ?? []) as AvailabilityPollVote[]).map((v) => ({
        ...v,
        slot_ids: (v.slot_ids as string[]) ?? [],
      }));
    }
  }

  return polls.map((p) => {
    const pv = votes.filter((v) => v.poll_id === p.id);
    const counts = new Map<string, number>();
    for (const slot of p.slots) counts.set(slot.id, 0);
    for (const v of pv) {
      for (const sid of v.slot_ids) {
        counts.set(sid, (counts.get(sid) ?? 0) + 1);
      }
    }
    const tallies = [...counts.entries()]
      .map(([slotId, count]) => ({ slotId, count }))
      .sort((a, b) => b.count - a.count || a.slotId.localeCompare(b.slotId));
    const bestSlotId =
      p.chosen_slot_id ??
      (tallies[0] && tallies[0].count > 0 ? tallies[0].slotId : null);
    return { ...p, votes: pv, tallies, bestSlotId };
  });
}

export async function createPoll(input: {
  teamId: string;
  title: string;
  slots: { startsAt: string; endsAt?: string | null; label?: string }[];
  actorId: string;
  closesAt?: string | null;
}): Promise<AvailabilityPoll> {
  if (input.slots.length < 2) {
    throw new Error("Propose at least two times.");
  }
  const slots: AvailabilitySlot[] = input.slots.map((s, i) => ({
    id: `s${i + 1}-${createHash("sha1").update(s.startsAt).digest("hex").slice(0, 6)}`,
    starts_at: s.startsAt,
    ends_at: s.endsAt ?? null,
    label: s.label,
  }));
  const row: AvailabilityPoll = {
    id: randomUUID(),
    team_id: input.teamId,
    title: input.title.trim() || "When can you meet?",
    slots,
    created_by: input.actorId,
    created_at: nowIso(),
    closes_at: input.closesAt ?? null,
    chosen_slot_id: null,
    resulting_event_id: null,
  };

  if (isSampleDataMode()) {
    await updateStore((s) => {
      ((s as StoreBag).availability_polls ??= []).push(row);
    });
  } else {
    const { getServiceSupabase } = await import("@/lib/db/supabase/client");
    const { error } = await getServiceSupabase()
      .from("availability_polls")
      .insert({
        id: row.id,
        team_id: row.team_id,
        title: row.title,
        slots: row.slots,
        created_by: row.created_by,
        created_at: row.created_at,
        closes_at: row.closes_at,
      });
    if (error) throw new Error(error.message);
  }

  await logActivity({
    person_id: input.actorId,
    action: "availability_poll_created",
    target: row.id,
    meta: { team_id: input.teamId },
  });
  return row;
}

export async function votePoll(input: {
  pollId: string;
  personId: string;
  slotIds: string[];
}): Promise<void> {
  const stamp = nowIso();
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = ((s as StoreBag).availability_poll_votes ??= []);
      const i = bag.findIndex(
        (v) => v.poll_id === input.pollId && v.person_id === input.personId,
      );
      const row: AvailabilityPollVote = {
        poll_id: input.pollId,
        person_id: input.personId,
        slot_ids: input.slotIds,
        updated_at: stamp,
      };
      if (i >= 0) bag[i] = row;
      else bag.push(row);
    });
  } else {
    const { getServiceSupabase } = await import("@/lib/db/supabase/client");
    await getServiceSupabase().from("availability_poll_votes").upsert(
      {
        poll_id: input.pollId,
        person_id: input.personId,
        slot_ids: input.slotIds,
        updated_at: stamp,
      },
      { onConflict: "poll_id,person_id" },
    );
  }
  await logActivity({
    person_id: input.personId,
    action: "availability_poll_voted",
    target: input.pollId,
    meta: { slots: input.slotIds.length },
  });
}

export async function lockPollToEvent(input: {
  pollId: string;
  slotId: string;
  actorId: string;
}): Promise<{ poll: AvailabilityPoll; event: TeamEvent }> {
  const polls = await listPolls(
    (
      await (async () => {
        if (isSampleDataMode()) {
          const store = await readStore();
          return (
            ((store as StoreBag).availability_polls ?? []).find(
              (p) => p.id === input.pollId,
            )?.team_id ?? ""
          );
        }
        const { getServiceSupabase } = await import("@/lib/db/supabase/client");
        const { data } = await getServiceSupabase()
          .from("availability_polls")
          .select("team_id")
          .eq("id", input.pollId)
          .maybeSingle();
        return (data?.team_id as string) ?? "";
      })()
    ),
  );
  const poll = polls.find((p) => p.id === input.pollId);
  if (!poll) throw new Error("Poll not found");
  const slot = poll.slots.find((s) => s.id === input.slotId);
  if (!slot) throw new Error("Pick a time from the poll");

  const event = await createTeamEvent({
    teamId: poll.team_id,
    title: poll.title,
    kind: "practice",
    startsAt: slot.starts_at,
    endsAt: slot.ends_at,
    actorId: input.actorId,
    body: "From availability poll",
  });

  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = ((s as StoreBag).availability_polls ??= []);
      const i = bag.findIndex((p) => p.id === input.pollId);
      if (i >= 0) {
        bag[i] = {
          ...bag[i]!,
          chosen_slot_id: input.slotId,
          resulting_event_id: event.id,
        };
      }
    });
  } else {
    const { getServiceSupabase } = await import("@/lib/db/supabase/client");
    await getServiceSupabase()
      .from("availability_polls")
      .update({
        chosen_slot_id: input.slotId,
        resulting_event_id: event.id,
      })
      .eq("id", input.pollId);
  }

  return {
    poll: {
      ...poll,
      chosen_slot_id: input.slotId,
      resulting_event_id: event.id,
    },
    event,
  };
}

export async function createKudos(input: {
  teamId: string;
  fromPersonId: string;
  toPersonId: string;
  body: string;
  roundId?: string | null;
  caseId?: string | null;
  fromName: string;
}): Promise<PeerKudos> {
  const text = input.body.trim();
  if (!text) throw new Error("Write a short note.");
  if (text.length > 500) throw new Error("Keep the note under 500 characters.");
  if (input.fromPersonId === input.toPersonId) {
    throw new Error("Pick a teammate.");
  }
  const row: PeerKudos = {
    id: randomUUID(),
    team_id: input.teamId,
    from_person_id: input.fromPersonId,
    to_person_id: input.toPersonId,
    body: text,
    round_id: input.roundId ?? null,
    case_id: input.caseId ?? null,
    created_at: nowIso(),
  };

  if (isSampleDataMode()) {
    await updateStore((s) => {
      ((s as StoreBag).peer_kudos ??= []).push(row);
    });
  } else {
    const { getServiceSupabase } = await import("@/lib/db/supabase/client");
    const { error } = await getServiceSupabase().from("peer_kudos").insert(row);
    if (error) throw new Error(error.message);
  }

  await logActivity({
    person_id: input.fromPersonId,
    action: "peer_kudos_sent",
    target: input.toPersonId,
    meta: { kudos_id: row.id, team_id: input.teamId },
  });

  try {
    await createNotification({
      personId: input.toPersonId,
      kind: "kudos",
      title: `${input.fromName} sent you a note`,
      body: text.slice(0, 160),
      href: "/progress",
      payload: { kudos_id: row.id },
      createdBy: input.fromPersonId,
    });
  } catch {
    // ignore
  }

  return row;
}

export async function listKudosForPerson(
  personId: string,
): Promise<PeerKudos[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return ((store as StoreBag).peer_kudos ?? [])
      .filter((k) => k.to_person_id === personId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  const { getServiceSupabase } = await import("@/lib/db/supabase/client");
  const { data } = await getServiceSupabase()
    .from("peer_kudos")
    .select("*")
    .eq("to_person_id", personId)
    .order("created_at", { ascending: false });
  return (data as PeerKudos[]) ?? [];
}

export async function listKudosForTeam(teamId: string): Promise<PeerKudos[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return ((store as StoreBag).peer_kudos ?? [])
      .filter((k) => k.team_id === teamId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 40);
  }
  const { getServiceSupabase } = await import("@/lib/db/supabase/client");
  const { data } = await getServiceSupabase()
    .from("peer_kudos")
    .select("*")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false })
    .limit(40);
  return (data as PeerKudos[]) ?? [];
}
