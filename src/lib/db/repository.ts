import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import {
  readStore,
  updateStore,
  type SampleStore,
} from "@/lib/db/sample-store";
import * as sbAuth from "@/lib/db/supabase/foundation";
import * as sbProgram from "@/lib/db/supabase/program";
import type {
  ActivityLogEntry,
  AiCall,
  AuthCode,
  CalibrationRow,
  CaseRow,
  Competition,
  CompetitionLogEntry,
  DriveSortItem,
  FeatureUsageStat,
  Person,
  ProgramTotals,
  ReadinessCell,
  Role,
  SpendCaps,
  Team,
  WeeklyEmailPreview,
} from "@/lib/types";
import { AI_ERRORS_LAST_24H_NOTE } from "@/lib/types";
import type { BookRequest } from "@/lib/library/types";
import { nowIso } from "@/lib/utils";
import {
  MONTHLY_CAP_USD_DEFAULT,
  PER_PERSON_ASSISTANT_DAY_CAP_USD,
  PER_RESEARCH_NIGHT_CAP_USD,
  PER_ROUND_CAP_USD,
} from "@/lib/constants";

/** Public person fields safe for client name-picker (no auth secrets). */
export type PublicPerson = Pick<
  Person,
  "id" | "name" | "team_id" | "role" | "last_sign_in_at"
>;

export async function listTeams(): Promise<Team[]> {
  if (!isSampleDataMode()) return sbAuth.listTeams();
  const store = await readStore();
  return store.teams;
}

export async function listPeoplePublic(): Promise<{
  teams: Team[];
  people: PublicPerson[];
}> {
  if (!isSampleDataMode()) return sbAuth.listPeoplePublic();
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
  if (!isSampleDataMode()) return sbAuth.getPersonById(id);
  const store = await readStore();
  return store.people.find((p) => p.id === id) ?? null;
}

export async function getAuthCodesForPerson(
  personId: string,
): Promise<AuthCode[]> {
  if (!isSampleDataMode()) return sbAuth.getAuthCodesForPerson(personId);
  const store = await readStore();
  return store.auth_codes.filter((c) => c.person_id === personId);
}

export async function getSharedStarter(): Promise<AuthCode | null> {
  if (!isSampleDataMode()) return sbAuth.getSharedStarter();
  const store = await readStore();
  return (
    store.auth_codes.find((c) => c.kind === "starter" && !c.person_id) ?? null
  );
}

/** Starter row scoped to one person (Dr. B). Never use as the shared member code. */
export async function getPersonStarter(
  personId: string,
): Promise<AuthCode | null> {
  if (!isSampleDataMode()) return sbAuth.getPersonStarter(personId);
  const store = await readStore();
  return (
    store.auth_codes.find(
      (c) => c.kind === "starter" && c.person_id === personId,
    ) ?? null
  );
}

export async function getAdminCode(
  personId: string,
): Promise<AuthCode | null> {
  if (!isSampleDataMode()) return sbAuth.getAdminCode(personId);
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
  if (!isSampleDataMode()) return sbAuth.getPersonalCode(personId);
  const store = await readStore();
  return (
    store.auth_codes.find(
      (c) => c.kind === "personal" && c.person_id === personId,
    ) ?? null
  );
}

export async function savePerson(person: Person): Promise<void> {
  if (!isSampleDataMode()) return sbAuth.savePerson(person);
  await updateStore((s) => {
    const i = s.people.findIndex((p) => p.id === person.id);
    if (i >= 0) s.people[i] = person;
    else s.people.push(person);
  });
}

export async function upsertAuthCode(code: AuthCode): Promise<void> {
  if (!isSampleDataMode()) return sbAuth.upsertAuthCode(code);
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
  if (!isSampleDataMode()) return sbAuth.replacePersonalCode(personId, next);
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
  if (!isSampleDataMode()) return sbAuth.logActivity(entry);
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
  if (!isSampleDataMode()) return sbAuth.listActivityLog(limit);
  const store = await readStore();
  return store.activity_log.slice(0, limit);
}

export async function insertAiCall(
  call: Omit<AiCall, "id" | "created_at">,
): Promise<AiCall> {
  if (!isSampleDataMode()) return sbProgram.insertAiCall(call);
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
  if (!isSampleDataMode()) return sbProgram.sumMonthlySpendUsd(now);
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
  if (!isSampleDataMode()) return sbAuth.listPasscodeRows();
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
  if (!isSampleDataMode()) return sbAuth.setTechReauth(at);
  await updateStore((s) => {
    s.last_tech_reauth_at = at;
  });
}

export async function getTechReauth(): Promise<string | null> {
  if (!isSampleDataMode()) return sbAuth.getTechReauth();
  const store = await readStore();
  return store.last_tech_reauth_at;
}

export async function updateSharedStarterHash(hash: string) {
  if (!isSampleDataMode()) return sbAuth.updateSharedStarterHash(hash);
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

export async function invalidateSessionsForPerson(personId: string) {
  if (!isSampleDataMode()) return sbAuth.invalidateSessionsForPerson(personId);
  // Sample path: sessions are JWTs; reset is enforced by must_choose + code change.
  void personId;
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
  if (!isSampleDataMode()) {
    throw new Error(
      "dumpStoreForAdmin is sample-data only; use listAuthCodesMeta on live",
    );
  }
  return readStore();
}

/** Live-safe auth_codes listing for the tech-admin panel (never returns plaintext). */
export async function listAuthCodesMeta(): Promise<AuthCode[]> {
  if (!isSampleDataMode()) return sbAuth.listAllAuthCodes();
  const store = await readStore();
  return store.auth_codes;
}

// ---------- Track 6: program map / admin / spend ----------

export async function listCases(): Promise<CaseRow[]> {
  if (!isSampleDataMode()) return sbProgram.listCases();
  const store = await readStore();
  return store.cases;
}

export async function listCompetitions(): Promise<Competition[]> {
  if (!isSampleDataMode()) return sbProgram.listCompetitions();
  const store = await readStore();
  return store.competitions;
}

export async function listReadiness(): Promise<ReadinessCell[]> {
  if (!isSampleDataMode()) return sbProgram.listReadiness();
  const store = await readStore();
  return store.readiness;
}

export async function getProgramTotals(): Promise<ProgramTotals> {
  if (!isSampleDataMode()) return sbProgram.getProgramTotals();
  const store = await readStore();
  // Match production: rounds graded = saved round reports (moves after a real round).
  return {
    ...store.program_totals,
    rounds_graded: store.round_reports.length,
  };
}

export async function listPeopleFull(): Promise<Person[]> {
  if (!isSampleDataMode()) return sbAuth.listPeopleFull();
  const store = await readStore();
  return store.people;
}

export async function getSpendCaps(): Promise<SpendCaps> {
  if (!isSampleDataMode()) return sbProgram.getSpendCaps();
  const store = await readStore();
  return (
    store.spend_caps ?? {
      monthly_usd: MONTHLY_CAP_USD_DEFAULT,
      per_round_usd: PER_ROUND_CAP_USD,
      per_research_night_usd: PER_RESEARCH_NIGHT_CAP_USD,
      per_person_assistant_day_usd: PER_PERSON_ASSISTANT_DAY_CAP_USD,
      research_paused: false,
      updated_at: nowIso(),
      updated_by: null,
    }
  );
}

export async function updateSpendCaps(
  patch: Partial<SpendCaps>,
  actorId: string,
): Promise<SpendCaps> {
  if (!isSampleDataMode()) return sbProgram.updateSpendCaps(patch, actorId);
  let next!: SpendCaps;
  await updateStore((s) => {
    s.spend_caps = {
      ...s.spend_caps,
      ...patch,
      updated_at: nowIso(),
      updated_by: actorId,
    };
    next = s.spend_caps;
  });
  return next;
}

export async function listAiCalls(): Promise<AiCall[]> {
  if (!isSampleDataMode()) return sbProgram.listAiCalls();
  const store = await readStore();
  return store.ai_calls;
}

export async function spendByFeature(now = new Date()): Promise<
  { feature: string; cost_usd: number; calls: number }[]
> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const calls = (await listAiCalls()).filter(
    (c) => !c.refused && new Date(c.created_at) >= start,
  );
  const map = new Map<string, { cost_usd: number; calls: number }>();
  for (const c of calls) {
    const key = c.feature;
    const cur = map.get(key) ?? { cost_usd: 0, calls: 0 };
    cur.cost_usd += c.cost_usd;
    cur.calls += 1;
    map.set(key, cur);
  }
  return [...map.entries()]
    .map(([feature, v]) => ({ feature, ...v }))
    .sort((a, b) => b.cost_usd - a.cost_usd);
}

export async function spendByPerson(now = new Date()): Promise<
  { person_id: string | null; cost_usd: number; calls: number }[]
> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const calls = (await listAiCalls()).filter(
    (c) => !c.refused && new Date(c.created_at) >= start,
  );
  const map = new Map<string, { person_id: string | null; cost_usd: number; calls: number }>();
  for (const c of calls) {
    const key = c.person_id ?? "system";
    const cur = map.get(key) ?? {
      person_id: c.person_id,
      cost_usd: 0,
      calls: 0,
    };
    cur.cost_usd += c.cost_usd;
    cur.calls += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.cost_usd - a.cost_usd);
}

export async function listBookRequests(): Promise<BookRequest[]> {
  if (!isSampleDataMode()) return sbProgram.listBookRequests();
  const store = await readStore();
  return store.book_requests;
}

export async function listDriveSortQueue(): Promise<DriveSortItem[]> {
  if (!isSampleDataMode()) return sbProgram.listDriveSortQueue();
  const store = await readStore();
  return store.drive_sort_queue;
}

export async function sortDriveItem(
  id: string,
  status: DriveSortItem["status"] = "sorted",
): Promise<DriveSortItem | null> {
  if (!isSampleDataMode()) return sbProgram.sortDriveItem(id, status);
  let found: DriveSortItem | null = null;
  await updateStore((s) => {
    const item = s.drive_sort_queue.find((d) => d.id === id);
    if (item) {
      item.status = status;
      found = item;
    }
  });
  return found;
}

export async function listCalibration(): Promise<CalibrationRow[]> {
  if (!isSampleDataMode()) return sbProgram.listCalibration();
  const store = await readStore();
  return store.calibration;
}

export async function listCompetitionLogs(): Promise<CompetitionLogEntry[]> {
  if (!isSampleDataMode()) return sbProgram.listCompetitionLogs();
  const store = await readStore();
  return store.competition_logs;
}

export async function addCompetitionLog(
  entry: Omit<CompetitionLogEntry, "id" | "created_at">,
): Promise<CompetitionLogEntry> {
  if (!isSampleDataMode()) return sbProgram.addCompetitionLog(entry);
  const row: CompetitionLogEntry = {
    ...entry,
    id: randomUUID(),
    created_at: nowIso(),
  };
  await updateStore((s) => {
    s.competition_logs.unshift(row);
  });
  return row;
}

export async function recordLastVisit(personId: string): Promise<void> {
  if (!isSampleDataMode()) return sbProgram.recordLastVisit(personId);
  await updateStore((s) => {
    s.last_visits[personId] = nowIso();
  });
}

export async function getLastVisit(personId: string): Promise<string | null> {
  if (!isSampleDataMode()) return sbProgram.getLastVisit(personId);
  const store = await readStore();
  return store.last_visits[personId] ?? null;
}

const HIDDEN_ACTIVITY_ACTIONS = new Set(["arg_edge_recorded"]);

export async function changesSince(
  sinceIso: string | null,
  limit = 20,
): Promise<ActivityLogEntry[]> {
  if (!isSampleDataMode()) return sbProgram.changesSince(sinceIso, limit);
  const log = await listActivityLog(200);
  const visible = log.filter((e) => !HIDDEN_ACTIVITY_ACTIONS.has(e.action));
  if (!sinceIso) return visible.slice(0, limit);
  const since = new Date(sinceIso).getTime();
  return visible
    .filter((e) => new Date(e.at).getTime() > since)
    .slice(0, limit);
}

export async function featureUsageStats(): Promise<FeatureUsageStat[]> {
  if (!isSampleDataMode()) return sbProgram.featureUsageStats();
  const store = await readStore();
  const byFeature = new Map<
    string,
    { uses: number; people: Set<string>; useful: number }
  >();
  for (const c of store.ai_calls) {
    if (c.refused) continue;
    const cur = byFeature.get(c.feature) ?? {
      uses: 0,
      people: new Set<string>(),
      useful: 0,
    };
    cur.uses += 1;
    if (c.person_id) cur.people.add(c.person_id);
    byFeature.set(c.feature, cur);
  }
  for (const u of store.feature_useful) {
    const cur = byFeature.get(u.feature) ?? {
      uses: 0,
      people: new Set<string>(),
      useful: 0,
    };
    cur.useful += 1;
    byFeature.set(u.feature, cur);
  }
  return [...byFeature.entries()].map(([feature, v]) => ({
    feature,
    uses: v.uses,
    unique_people: v.people.size,
    useful_marks: v.useful,
  }));
}

export async function markFeatureUseful(
  feature: string,
  personId: string,
): Promise<void> {
  if (!isSampleDataMode()) return sbProgram.markFeatureUseful(feature, personId);
  await updateStore((s) => {
    s.feature_useful.push({
      feature,
      person_id: personId,
      at: nowIso(),
    });
  });
}

export async function teamReadinessAverages(): Promise<
  { team_id: string; avg: number; delta_week: number }[]
> {
  if (!isSampleDataMode()) return sbProgram.teamReadinessAverages();
  const store = await readStore();
  const byTeam = new Map<string, number[]>();
  for (const cell of store.readiness) {
    const arr = byTeam.get(cell.team_id) ?? [];
    arr.push(cell.readiness_pct);
    byTeam.set(cell.team_id, arr);
  }
  // Sample deltas match baseline screens
  const deltas: Record<string, number> = {};
  const teams = store.teams;
  if (teams[0]) deltas[teams[0].id] = 9;
  if (teams[1]) deltas[teams[1].id] = 6;
  if (teams[2]) deltas[teams[2].id] = 11;
  return [...byTeam.entries()].map(([team_id, vals]) => ({
    team_id,
    avg: vals.length
      ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
      : 0,
    delta_week: deltas[team_id] ?? 0,
  }));
}

export async function buildWeeklyEmailPreview(): Promise<WeeklyEmailPreview> {
  if (!isSampleDataMode()) return sbProgram.buildWeeklyEmailPreview();
  const store = await readStore();
  const teams = store.teams;
  const people = store.people;
  const readiness = await teamReadinessAverages();
  const spent = await sumMonthlySpendUsd();
  const caps = await getSpendCaps();

  const opted = people.filter(
    (p) =>
      (p.role === "tech_admin" || p.role === "coach_admin") &&
      p.digest_opt_in &&
      p.email,
  );

  return {
    attendance: people
      .filter((p) => p.role === "member" || p.role === "tech_admin")
      .slice(0, 12)
      .map((p) => ({
        name: p.name,
        sessions: 3,
        present: p.last_sign_in_at ? 3 : 0,
      })),
    scoresByTeam: teams.map((t) => {
      const r = readiness.find((x) => x.team_id === t.id);
      return {
        team: t.name,
        rounds: 4,
        avg: r ? Math.round((r.avg / 100) * 60) : 0,
      };
    }),
    biggestImprovements: [
      "Team 3 +11 readiness this week",
      "Serena redo on Case 7: +8 points",
      "Nick flashcard streak: 5 days",
    ],
    casesAtRisk: store.readiness
      .filter((c) => c.readiness_pct < 35)
      .slice(0, 4)
      .map((c) => {
        const team = teams.find((t) => t.id === c.team_id)?.name ?? "?";
        const cas = store.cases.find((x) => x.id === c.case_id);
        return `${team}, Case ${cas?.number ?? "?"} at ${c.readiness_pct}%`;
      }),
    openDisagreements: [
      "Case 3: Team 1 accepted Unit 731 example; Team 3 rejected",
      "Case 9: Inspired-by from Team 1 waiting on Team 3",
    ],
    thingsToCare: [
      "Ask for a clearer distinction on Case 13 counterclaim",
      "Confirm Case 10 lead assignment",
    ],
    spendLine: `$${spent.toFixed(2)} / $${caps.monthly_usd} this month`,
    errors: (() => {
      const since = Date.now() - 24 * 60 * 60 * 1000;
      return store.ai_calls
        .filter(
          (c) =>
            c.refused && new Date(c.created_at).getTime() >= since,
        )
        .slice(0, 5)
        .map((c) => `${c.feature}: ${c.refuse_reason ?? "refused"}`);
    })(),
    errorsNote: AI_ERRORS_LAST_24H_NOTE,
    recipients: opted.map((p) => ({
      name: p.name,
      email: p.email!,
      includeSpend: p.role === "tech_admin",
    })),
  };
}

export async function setDigestOptIn(
  personId: string,
  optIn: boolean,
): Promise<Person | null> {
  const person = await getPersonById(personId);
  if (!person) return null;
  person.digest_opt_in = optIn;
  await savePerson(person);
  return person;
}

export async function archiveSeasonStub(actorId: string): Promise<{
  ok: true;
  message: string;
}> {
  await logActivity({
    person_id: actorId,
    action: "season_rollover_requested",
    target: "california_regional",
    meta: {
      note: "Stub: archive Drive + import next case set when Track 1 Drive sync is live",
    },
  });
  return {
    ok: true,
    message:
      "Season rollover queued. Build the archive from Admin, then import the next case set when Drive sync is connected.",
  };
}
