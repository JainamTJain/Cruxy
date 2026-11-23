import "server-only";
import { randomUUID } from "crypto";
import { assertOk, getServiceSupabase } from "@/lib/db/supabase/client";
import type {
  ActivityLogEntry,
  AuthCode,
  Person,
  Role,
  Team,
} from "@/lib/types";
import { COACH_PERSON_ID } from "@/lib/constants";
import { nowIso } from "@/lib/utils";

type PublicPerson = Pick<
  Person,
  "id" | "name" | "team_id" | "role" | "last_sign_in_at"
>;

type PersonRow = {
  id: string;
  name: string;
  team_id: string | null;
  role: Role;
  email: string | null;
  email_reminders_opt_in: boolean;
  digest_opt_in: boolean;
  consent_version: string | null;
  consent_at: string | null;
  recording_ok: boolean;
  voice_sample_path: string | null;
  pronunciation_note: string | null;
  first_run_checklist: Record<string, boolean> | null;
  failed_attempts: number;
  locked_until: string | null;
  last_sign_in_at: string | null;
  session_version?: number;
  created_at: string;
  created_by: string | null;
};

type AuthCodeRow = {
  id: string;
  kind: AuthCode["kind"];
  person_id: string | null;
  hash: string;
  encrypted_copy: string | null;
  must_choose: boolean;
  set_at: string | null;
  last_revealed_at: string | null;
  created_at: string;
};

function mapPerson(row: PersonRow): Person {
  return {
    id: row.id,
    name: row.name,
    team_id: row.team_id,
    role: row.role,
    email: row.email,
    email_reminders_opt_in: row.email_reminders_opt_in,
    digest_opt_in: row.digest_opt_in,
    consent_version: row.consent_version,
    consent_at: row.consent_at,
    recording_ok: row.recording_ok,
    voice_sample_path: row.voice_sample_path,
    voiceprint: (row as { voiceprint?: number[] | null }).voiceprint ?? null,
    voiceprint_at: (row as { voiceprint_at?: string | null }).voiceprint_at ?? null,
    voiceprint_meta:
      (row as { voiceprint_meta?: Record<string, unknown> | null })
        .voiceprint_meta ?? null,
    pronunciation_note: row.pronunciation_note ?? null,
    first_run_checklist: row.first_run_checklist ?? {},
    failed_attempts: row.failed_attempts,
    locked_until: row.locked_until,
    last_sign_in_at: row.last_sign_in_at,
    created_at: row.created_at,
    created_by: row.created_by,
  };
}

function mapAuthCode(row: AuthCodeRow): AuthCode {
  return {
    id: row.id,
    kind: row.kind,
    person_id: row.person_id,
    hash: row.hash,
    encrypted_copy: row.encrypted_copy,
    must_choose: row.must_choose,
    set_at: row.set_at,
    last_revealed_at: row.last_revealed_at,
    created_at: row.created_at,
  };
}

function isUniqueViolation(error: { code?: string; message: string } | null): boolean {
  if (!error) return false;
  return error.code === "23505" || /duplicate key/i.test(error.message);
}

/** True when MEMBER_STARTER_CODE_HASH is unset (admins should see a clear message). */
export function missingStarterHash(): boolean {
  return !process.env.MEMBER_STARTER_CODE_HASH?.trim();
}

async function fetchSharedStarter(): Promise<AuthCode | null> {
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("auth_codes")
    .select("*")
    .eq("kind", "starter")
    .is("person_id", null)
    .maybeSingle();
  assertOk(error, "fetchSharedStarter");
  return data ? mapAuthCode(data as AuthCodeRow) : null;
}

async function fetchAdminCode(personId: string): Promise<AuthCode | null> {
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("auth_codes")
    .select("*")
    .eq("kind", "admin")
    .eq("person_id", personId)
    .maybeSingle();
  assertOk(error, "fetchAdminCode");
  return data ? mapAuthCode(data as AuthCodeRow) : null;
}

async function fetchPersonStarter(personId: string): Promise<AuthCode | null> {
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("auth_codes")
    .select("*")
    .eq("kind", "starter")
    .eq("person_id", personId)
    .maybeSingle();
  assertOk(error, "fetchPersonStarter");
  return data ? mapAuthCode(data as AuthCodeRow) : null;
}

/**
 * Idempotent bootstrap for empty auth_codes on the live project.
 * - Shared starter from MEMBER_STARTER_CODE_HASH (argon2id, same ARGON2_OPTS).
 * - Coach starter (Dr. B) from COACH_STARTER_CODE_HASH, kind=starter + person_id.
 * - Tech admin (Jainam) admin row from INITIAL_ADMIN_CODE_HASH, must_choose=true.
 * Never logs the hash values.
 */
export async function bootstrapAuthCodes(): Promise<void> {
  const sb = getServiceSupabase();

  const existingStarter = await fetchSharedStarter();
  if (!existingStarter) {
    const hash = process.env.MEMBER_STARTER_CODE_HASH?.trim();
    if (hash) {
      const { error } = await sb.from("auth_codes").insert({
        id: randomUUID(),
        kind: "starter",
        person_id: null,
        hash,
        encrypted_copy: null,
        must_choose: false,
        set_at: nowIso(),
        last_revealed_at: null,
        created_at: nowIso(),
      });
      if (error && !isUniqueViolation(error)) {
        assertOk(error, "bootstrapAuthCodes.starter");
      }
    }
  }

  // Dr. B: own starter row (person_id set). Look up by role, fall back to seed id.
  const { data: coaches, error: coachErr } = await sb
    .from("people")
    .select("id")
    .eq("role", "coach_admin")
    .limit(1);
  assertOk(coachErr, "bootstrapAuthCodes.coach");
  const coachId = (coaches?.[0]?.id as string | undefined) ?? COACH_PERSON_ID;
  const existingCoachStarter = await fetchPersonStarter(coachId);
  if (!existingCoachStarter) {
    const coachHash = process.env.COACH_STARTER_CODE_HASH?.trim();
    if (coachHash) {
      const { error } = await sb.from("auth_codes").insert({
        id: randomUUID(),
        kind: "starter",
        person_id: coachId,
        hash: coachHash,
        encrypted_copy: null,
        must_choose: false,
        set_at: nowIso(),
        last_revealed_at: null,
        created_at: nowIso(),
      });
      if (error && !isUniqueViolation(error)) {
        assertOk(error, "bootstrapAuthCodes.coachStarter");
      }
    }
  }

  const { data: techAdmins, error: techErr } = await sb
    .from("people")
    .select("id")
    .eq("role", "tech_admin")
    .limit(1);
  assertOk(techErr, "bootstrapAuthCodes.techAdmin");
  const techId = techAdmins?.[0]?.id as string | undefined;
  if (techId) {
    const existingAdmin = await fetchAdminCode(techId);
    if (!existingAdmin) {
      const adminHash = process.env.INITIAL_ADMIN_CODE_HASH?.trim();
      if (adminHash) {
        const { error } = await sb.from("auth_codes").insert({
          id: randomUUID(),
          kind: "admin",
          person_id: techId,
          hash: adminHash,
          encrypted_copy: null,
          must_choose: true,
          set_at: nowIso(),
          last_revealed_at: null,
          created_at: nowIso(),
        });
        if (error && !isUniqueViolation(error)) {
          assertOk(error, "bootstrapAuthCodes.admin");
        }
      }
    }
  }
}

export async function ensureSharedStarterFromEnv(): Promise<AuthCode | null> {
  await bootstrapAuthCodes();
  return fetchSharedStarter();
}

export async function ensureAdminCodeFromEnv(
  personId: string,
): Promise<AuthCode | null> {
  await bootstrapAuthCodes();
  return fetchAdminCode(personId);
}

export async function listTeams(): Promise<Team[]> {
  const { cachedRead, READ_CACHE_KEYS } = await import(
    "@/lib/db/supabase/read-cache"
  );
  return cachedRead(READ_CACHE_KEYS.teams, async () => {
    const sb = getServiceSupabase();
    const { data, error } = await sb
      .from("teams")
      .select("id, name, colour, created_at")
      .order("name");
    assertOk(error, "listTeams");
    return (data ?? []) as Team[];
  });
}

export async function listPeoplePublic(): Promise<{
  teams: Team[];
  people: PublicPerson[];
}> {
  // First name-picker hit bootstraps starter/admin rows when auth_codes is empty.
  await bootstrapAuthCodes();
  const sb = getServiceSupabase();
  const [teams, peopleRes] = await Promise.all([
    listTeams(),
    sb
      .from("people")
      .select("id, name, team_id, role, last_sign_in_at")
      .order("name"),
  ]);
  assertOk(peopleRes.error, "listPeoplePublic");
  return {
    teams,
    people: (peopleRes.data ?? []) as PublicPerson[],
  };
}

export async function getPersonById(id: string): Promise<Person | null> {
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("people")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  assertOk(error, "getPersonById");
  return data ? mapPerson(data as PersonRow) : null;
}

export async function getAuthCodesForPerson(
  personId: string,
): Promise<AuthCode[]> {
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("auth_codes")
    .select("*")
    .eq("person_id", personId);
  assertOk(error, "getAuthCodesForPerson");
  return ((data ?? []) as AuthCodeRow[]).map(mapAuthCode);
}

export async function getSharedStarter(): Promise<AuthCode | null> {
  return ensureSharedStarterFromEnv();
}

/** Per-person starter (Dr. B). Only valid for that person_id. */
export async function getPersonStarter(
  personId: string,
): Promise<AuthCode | null> {
  await bootstrapAuthCodes();
  return fetchPersonStarter(personId);
}

export async function getAdminCode(
  personId: string,
): Promise<AuthCode | null> {
  const person = await getPersonById(personId);
  if (person?.role === "tech_admin") {
    return ensureAdminCodeFromEnv(personId);
  }
  return fetchAdminCode(personId);
}

export async function getPersonalCode(
  personId: string,
): Promise<AuthCode | null> {
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("auth_codes")
    .select("*")
    .eq("kind", "personal")
    .eq("person_id", personId)
    .maybeSingle();
  assertOk(error, "getPersonalCode");
  return data ? mapAuthCode(data as AuthCodeRow) : null;
}

export async function savePerson(person: Person): Promise<void> {
  const sb = getServiceSupabase();
  const { error } = await sb.from("people").upsert(
    {
      id: person.id,
      name: person.name,
      team_id: person.team_id,
      role: person.role,
      email: person.email,
      email_reminders_opt_in: person.email_reminders_opt_in,
      digest_opt_in: person.digest_opt_in,
      consent_version: person.consent_version,
      consent_at: person.consent_at,
      recording_ok: person.recording_ok,
      voice_sample_path: person.voice_sample_path,
      voiceprint: person.voiceprint ?? null,
      voiceprint_at: person.voiceprint_at ?? null,
      voiceprint_meta: person.voiceprint_meta ?? {},
      pronunciation_note: person.pronunciation_note,
      first_run_checklist: person.first_run_checklist,
      failed_attempts: person.failed_attempts,
      locked_until: person.locked_until,
      last_sign_in_at: person.last_sign_in_at,
      created_at: person.created_at,
      created_by: person.created_by,
    },
    { onConflict: "id" },
  );
  assertOk(error, "savePerson");
}

export async function upsertAuthCode(code: AuthCode): Promise<void> {
  const sb = getServiceSupabase();
  const { error } = await sb.from("auth_codes").upsert(
    {
      id: code.id,
      kind: code.kind,
      person_id: code.person_id,
      hash: code.hash,
      encrypted_copy: code.encrypted_copy,
      must_choose: code.must_choose,
      set_at: code.set_at,
      last_revealed_at: code.last_revealed_at,
      created_at: code.created_at,
    },
    { onConflict: "id" },
  );
  assertOk(error, "upsertAuthCode");
}

export async function replacePersonalCode(
  personId: string,
  next: Omit<AuthCode, "id" | "created_at"> & { id?: string },
): Promise<AuthCode> {
  const sb = getServiceSupabase();
  const { error: delErr } = await sb
    .from("auth_codes")
    .delete()
    .eq("kind", "personal")
    .eq("person_id", personId);
  assertOk(delErr, "replacePersonalCode.delete");

  const created: AuthCode = {
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
  await upsertAuthCode(created);
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
  const sb = getServiceSupabase();
  const { error } = await sb.from("activity_log").insert({
    id: row.id,
    person_id: row.person_id,
    action: row.action,
    target: row.target,
    meta: row.meta,
    ip_hash: row.ip_hash,
    at: row.at,
  });
  assertOk(error, "logActivity");
  return row;
}

export async function listActivityLog(limit = 100): Promise<ActivityLogEntry[]> {
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("activity_log")
    .select("*")
    .order("at", { ascending: false })
    .limit(limit);
  assertOk(error, "listActivityLog");
  return (data ?? []) as ActivityLogEntry[];
}

export async function listPasscodeRows(): Promise<
  { person: Person; code: AuthCode | null }[]
> {
  const sb = getServiceSupabase();
  const { data: people, error } = await sb.from("people").select("*");
  assertOk(error, "listPasscodeRows.people");
  const { data: codes, error: codeErr } = await sb
    .from("auth_codes")
    .select("*")
    .eq("kind", "personal");
  assertOk(codeErr, "listPasscodeRows.codes");
  const byPerson = new Map(
    ((codes ?? []) as AuthCodeRow[]).map((c) => [c.person_id, mapAuthCode(c)]),
  );
  return ((people ?? []) as PersonRow[])
    .filter((p) => p.role !== "tech_admin")
    .map((p) => ({
      person: mapPerson(p),
      code: byPerson.get(p.id) ?? null,
    }));
}

export async function setTechReauth(at: string | null): Promise<void> {
  const sb = getServiceSupabase();
  const { error } = await sb.from("app_kv").upsert(
    {
      key: "tech_reauth",
      value: { at },
      updated_at: nowIso(),
    },
    { onConflict: "key" },
  );
  assertOk(error, "setTechReauth");
}

export async function getTechReauth(): Promise<string | null> {
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("app_kv")
    .select("value")
    .eq("key", "tech_reauth")
    .maybeSingle();
  assertOk(error, "getTechReauth");
  const value = data?.value as { at?: string | null } | null;
  return value?.at ?? null;
}

export async function updateSharedStarterHash(hash: string): Promise<void> {
  const starter = await ensureSharedStarterFromEnv();
  if (!starter) {
    if (missingStarterHash()) {
      throw new Error(
        "MEMBER_STARTER_CODE_HASH is not set. Add it in Vercel env, then rotate the starter from the Passcodes panel.",
      );
    }
    throw new Error("Shared starter code row could not be created.");
  }
  starter.hash = hash;
  starter.set_at = nowIso();
  await upsertAuthCode(starter);
}

export async function invalidateSessionsForPerson(
  personId: string,
): Promise<void> {
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("people")
    .select("session_version")
    .eq("id", personId)
    .maybeSingle();
  assertOk(error, "invalidateSessionsForPerson.read");
  const next = (data?.session_version ?? 0) + 1;
  const { error: upErr } = await sb
    .from("people")
    .update({ session_version: next })
    .eq("id", personId);
  assertOk(upErr, "invalidateSessionsForPerson.bump");
}

export async function listPeopleFull(): Promise<Person[]> {
  const sb = getServiceSupabase();
  const { data, error } = await sb.from("people").select("*").order("name");
  assertOk(error, "listPeopleFull");
  return ((data ?? []) as PersonRow[]).map(mapPerson);
}

/** All auth_codes rows for the tech-admin codes panel (hashes stay server-side). */
export async function listAllAuthCodes(): Promise<AuthCode[]> {
  const sb = getServiceSupabase();
  const { data, error } = await sb.from("auth_codes").select("*");
  assertOk(error, "listAllAuthCodes");
  return ((data ?? []) as AuthCodeRow[]).map(mapAuthCode);
}
