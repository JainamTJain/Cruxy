import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import {
  readStore,
  updateStore,
  type SampleStore,
} from "@/lib/db/sample-store";
import type {
  ActivityLogEntry,
  AiCall,
  AuthCode,
  Person,
  Role,
  Team,
} from "@/lib/types";
import { nowIso } from "@/lib/utils";

/** Public person fields safe for client name-picker (no auth secrets). */
export type PublicPerson = Pick<
  Person,
  "id" | "name" | "team_id" | "role" | "last_sign_in_at"
>;

export async function listTeams(): Promise<Team[]> {
  if (!isSampleDataMode()) {
    // TODO(supabase): select from teams
    throw new Error("Supabase path not wired yet — set USE_SAMPLE_DATA=1");
  }
  const store = await readStore();
  return store.teams;
}

export async function listPeoplePublic(): Promise<{
  teams: Team[];
  people: PublicPerson[];
}> {
  if (!isSampleDataMode()) {
    throw new Error("Supabase path not wired yet — set USE_SAMPLE_DATA=1");
  }
  const store = await readStore();
  return {
    teams: store.teams,
    people: store.people.map((p) => ({
      id: p.id,
      name: p.name,
      team_id: p.team_id,
      role: p.role,
      last_sign_in_at: p.last_sign_in_at,
    })),
  };
}

export async function getPersonById(id: string): Promise<Person | null> {
  const store = await readStore();
  return store.people.find((p) => p.id === id) ?? null;
}

export async function getAuthCodesForPerson(
  personId: string,
): Promise<AuthCode[]> {
  const store = await readStore();
  return store.auth_codes.filter((c) => c.person_id === personId);
}

export async function getSharedStarter(): Promise<AuthCode | null> {
  const store = await readStore();
  return (
    store.auth_codes.find((c) => c.kind === "starter" && !c.person_id) ?? null
  );
}

export async function getAdminCode(
  personId: string,
): Promise<AuthCode | null> {
  const store = await readStore();
  return (
    store.auth_codes.find(
      (c) => c.kind === "admin" && c.person_id === personId,
    ) ?? null
  );
}

export async function getPersonalCode(
  personId: string,
): Promise<AuthCode | null> {
  const store = await readStore();
  return (
    store.auth_codes.find(
      (c) => c.kind === "personal" && c.person_id === personId,
    ) ?? null
  );
}

export async function savePerson(person: Person): Promise<void> {
  await updateStore((s) => {
    const i = s.people.findIndex((p) => p.id === person.id);
    if (i >= 0) s.people[i] = person;
    else s.people.push(person);
  });
}

export async function upsertAuthCode(code: AuthCode): Promise<void> {
  await updateStore((s) => {
    const i = s.auth_codes.findIndex((c) => c.id === code.id);
    if (i >= 0) s.auth_codes[i] = code;
    else s.auth_codes.push(code);
  });
}

export async function replacePersonalCode(
  personId: string,
  next: Omit<AuthCode, "id" | "created_at"> & { id?: string },
): Promise<AuthCode> {
  let created!: AuthCode;
  await updateStore((s) => {
    s.auth_codes = s.auth_codes.filter(
      (c) => !(c.kind === "personal" && c.person_id === personId),
    );
    created = {
      id: next.id ?? randomUUID(),
      created_at: nowIso(),
      kind: next.kind,
      person_id: next.person_id,
      hash: next.hash,
      encrypted_copy: next.encrypted_copy,
      must_choose: next.must_choose,
      set_at: next.set_at,
      last_revealed_at: next.last_revealed_at,
    };
    s.auth_codes.push(created);
  });
  return created;
}

export async function logActivity(entry: {
  person_id: string | null;
  action: string;
  target?: string | null;
  meta?: Record<string, unknown> | null;
  ip_hash?: string | null;
}): Promise<ActivityLogEntry> {
  const row: ActivityLogEntry = {
    id: randomUUID(),
    person_id: entry.person_id,
    action: entry.action,
    target: entry.target ?? null,
    meta: entry.meta ?? null,
    ip_hash: entry.ip_hash ?? null,
    at: nowIso(),
  };
  await updateStore((s) => {
    s.activity_log.unshift(row);
  });
  return row;
}

export async function listActivityLog(limit = 100): Promise<ActivityLogEntry[]> {
  const store = await readStore();
  return store.activity_log.slice(0, limit);
}

export async function insertAiCall(
  call: Omit<AiCall, "id" | "created_at">,
): Promise<AiCall> {
  const row: AiCall = {
    ...call,
    id: randomUUID(),
    created_at: nowIso(),
  };
  await updateStore((s) => {
    s.ai_calls.push(row);
  });
  return row;
}

export async function sumMonthlySpendUsd(
  now = new Date(),
): Promise<number> {
  const store = await readStore();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return store.ai_calls
    .filter((c) => !c.refused && new Date(c.created_at) >= start)
    .reduce((sum, c) => sum + c.cost_usd, 0);
}

export async function listPasscodeRows(): Promise<
  {
    person: Person;
    code: AuthCode | null;
  }[]
> {
  const store = await readStore();
  // Spec: Jainam's own passcode never appears in the panel
  return store.people
    .filter((person) => person.role !== "tech_admin")
    .map((person) => ({
      person,
      code:
        store.auth_codes.find(
          (c) => c.kind === "personal" && c.person_id === person.id,
        ) ?? null,
    }));
}

export async function setTechReauth(at: string | null) {
  await updateStore((s) => {
    s.last_tech_reauth_at = at;
  });
}

export async function getTechReauth(): Promise<string | null> {
  const store = await readStore();
  return store.last_tech_reauth_at;
}

export async function updateSharedStarterHash(hash: string) {
  await updateStore((s) => {
    const starter = s.auth_codes.find(
      (c) => c.kind === "starter" && !c.person_id,
    );
    if (starter) {
      starter.hash = hash;
      starter.set_at = nowIso();
    }
  });
}

export async function invalidateSessionsForPerson(_personId: string) {
  // Sample path: sessions are JWTs; reset is enforced by must_choose + code change.
  // Production: store session version on person and bump it.
  void _personId;
}

export function effectiveRole(
  person: Person,
  adminView: boolean,
): Role {
  if (!adminView) {
    if (person.role === "tech_admin" || person.role === "coach_admin") {
      return "member";
    }
  }
  return person.role;
}

export async function dumpStoreForAdmin(): Promise<SampleStore> {
  return readStore();
}
