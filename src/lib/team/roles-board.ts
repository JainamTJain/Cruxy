/**
 * Wave 7 E: Roles board helpers (gaps, load, templates).
 * Cells are person × case; at most one role per person per case.
 */
import {
  CASE_ROLE_LABELS,
  CASE_ROLE_SLOTS,
  type CaseRole,
  type CaseRoleSlot,
} from "@/lib/team/types";

export type RoleChip = CaseRoleSlot | "none";

export type CaseRolePreference = {
  id: string;
  team_id: string;
  person_id: string;
  case_id: string;
  rank: number;
  updated_at: string;
  updated_by: string | null;
};

export type RoleGap = {
  caseId: string;
  caseNumber: number;
  missing: CaseRoleSlot[];
  /** Suggested person id for the first missing slot (lightest load). */
  suggestion: { role: CaseRoleSlot; personId: string } | null;
};

export type RolesLockSnapshot = {
  seasonKey: string;
  label: string;
  lockedAt: string;
  lockedBy: string | null;
};

export type WorkloadBalanceRow = {
  personId: string;
  name: string;
  leadCount: number;
  roleCount: number;
  openTaskCount: number;
  total: number;
  heavy: boolean;
  suggestSwapWith: { personId: string; name: string } | null;
};

export type RolesBoardView = {
  teamId: string;
  teamName: string;
  canEdit: boolean;
  people: { id: string; name: string }[];
  cases: { id: string; number: number; title: string; active: boolean }[];
  /** personId -> caseId -> role chip */
  cells: Record<string, Record<string, RoleChip>>;
  load: { personId: string; leadCount: number; roleCount: number }[];
  gaps: RoleGap[];
  preferences: CaseRolePreference[];
  /** personId -> any case is fine */
  anyCaseOk: Record<string, boolean>;
  /** Regionals lock; when set, live edits are blocked */
  lock: RolesLockSnapshot | null;
  /** Wave 9: roles + open tasks; gentle heavy flag + swap suggestion */
  workload: WorkloadBalanceRow[];
};

export const REGIONALS_2026_SEASON = "regionals-2026";
export const REGIONALS_2026_LABEL = "Regionals 2026";

export const ROLE_CYCLE: RoleChip[] = [
  "none",
  "lead_1",
  "lead_2",
  "counter_arguer",
  "supporter",
];

export function nextRoleInCycle(current: RoleChip): RoleChip {
  const i = ROLE_CYCLE.indexOf(current);
  return ROLE_CYCLE[(i + 1) % ROLE_CYCLE.length]!;
}

export function roleForPersonOnCase(
  roles: CaseRole[],
  teamId: string,
  caseId: string,
  personId: string,
): RoleChip {
  const hit = roles.find(
    (r) =>
      r.team_id === teamId &&
      r.case_id === caseId &&
      r.person_id === personId,
  );
  if (!hit) return "none";
  return CASE_ROLE_SLOTS.includes(hit.role as CaseRoleSlot)
    ? (hit.role as CaseRoleSlot)
    : "none";
}

export type PersonLoad = {
  personId: string;
  leadCount: number;
  roleCount: number;
};

export function computeLoad(
  roles: CaseRole[],
  teamId: string,
  personIds: string[],
): PersonLoad[] {
  return personIds.map((personId) => {
    const mine = roles.filter(
      (r) => r.team_id === teamId && r.person_id === personId,
    );
    return {
      personId,
      leadCount: mine.filter(
        (r) => r.role === "lead_1" || r.role === "lead_2",
      ).length,
      roleCount: mine.length,
    };
  });
}

/**
 * Combine role load with open assignment counts. Flag people well above
 * the team average and suggest a lighter teammate for a fair swap.
 */
export function computeWorkloadBalance(input: {
  people: { id: string; name: string }[];
  load: PersonLoad[];
  openTasksByPerson: Record<string, number>;
}): WorkloadBalanceRow[] {
  const rows = input.people.map((p) => {
    const load = input.load.find((l) => l.personId === p.id);
    const leadCount = load?.leadCount ?? 0;
    const roleCount = load?.roleCount ?? 0;
    const openTaskCount = input.openTasksByPerson[p.id] ?? 0;
    const total = roleCount + openTaskCount + leadCount;
    return {
      personId: p.id,
      name: p.name,
      leadCount,
      roleCount,
      openTaskCount,
      total,
      heavy: false,
      suggestSwapWith: null as WorkloadBalanceRow["suggestSwapWith"],
    };
  });
  if (!rows.length) return rows;
  const avg = rows.reduce((s, r) => s + r.total, 0) / rows.length;
  const sortedAsc = [...rows].sort((a, b) => a.total - b.total);
  for (const r of rows) {
    // Gently flag when someone carries far more (about 1.6x average and at least +2)
    r.heavy = r.total >= Math.max(avg * 1.6, avg + 2) && r.total >= 3;
    if (r.heavy) {
      const lighter = sortedAsc.find(
        (o) => o.personId !== r.personId && o.total < r.total - 1,
      );
      if (lighter) {
        r.suggestSwapWith = {
          personId: lighter.personId,
          name: lighter.name,
        };
      }
    }
  }
  return rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

export function findGaps(input: {
  roles: CaseRole[];
  teamId: string;
  cases: { id: string; number: number; active?: boolean }[];
  people: { id: string }[];
}): RoleGap[] {
  const load = computeLoad(
    input.roles,
    input.teamId,
    input.people.map((p) => p.id),
  );
  const byLoad = [...load].sort(
    (a, b) => a.leadCount - b.leadCount || a.roleCount - b.roleCount,
  );

  const gaps: RoleGap[] = [];
  for (const c of input.cases) {
    // Inactive / not-at-regional cases never show as gaps
    if (c.active === false) continue;
    const onCase = input.roles.filter(
      (r) => r.team_id === input.teamId && r.case_id === c.id,
    );
    const missing: CaseRoleSlot[] = [];
    for (const slot of CASE_ROLE_SLOTS) {
      if (!onCase.some((r) => r.role === slot)) missing.push(slot);
    }
    if (!missing.length) continue;

    let suggestion: RoleGap["suggestion"] = null;
    const taken = new Set(onCase.map((r) => r.person_id));
    for (const slot of missing) {
      const pick = byLoad.find((p) => !taken.has(p.personId));
      if (pick) {
        suggestion = { role: slot, personId: pick.personId };
        break;
      }
    }
    gaps.push({
      caseId: c.id,
      caseNumber: c.number,
      missing,
      suggestion,
    });
  }
  return gaps;
}

/** Round-robin: rotate people as lead_1 / lead_2 / counter / supporter across cases. */
export function planRoundRobin(input: {
  caseIds: string[];
  personIds: string[];
}): { caseId: string; role: CaseRoleSlot; personId: string }[] {
  const people = input.personIds;
  if (!people.length) return [];
  const out: { caseId: string; role: CaseRoleSlot; personId: string }[] = [];
  input.caseIds.forEach((caseId, ci) => {
    CASE_ROLE_SLOTS.forEach((role, ri) => {
      const personId = people[(ci + ri) % people.length]!;
      // Avoid duplicate person on same case when team is small
      const used = out
        .filter((x) => x.caseId === caseId)
        .map((x) => x.personId);
      let pid = personId;
      let guard = 0;
      while (used.includes(pid) && guard < people.length) {
        pid = people[(ci + ri + guard + 1) % people.length]!;
        guard++;
      }
      if (!used.includes(pid)) {
        out.push({ caseId, role, personId: pid });
      }
    });
  });
  return out;
}

/** Same four people (or fewer) applied to every case. */
export function planSamePairs(input: {
  caseIds: string[];
  slots: Partial<Record<CaseRoleSlot, string | null>>;
}): { caseId: string; role: CaseRoleSlot; personId: string }[] {
  const out: { caseId: string; role: CaseRoleSlot; personId: string }[] = [];
  for (const caseId of input.caseIds) {
    const used = new Set<string>();
    for (const role of CASE_ROLE_SLOTS) {
      const personId = input.slots[role];
      if (!personId || used.has(personId)) continue;
      used.add(personId);
      out.push({ caseId, role, personId });
    }
  }
  return out;
}

/** Copy roles from source case onto target cases. */
export function planCopyCase(input: {
  roles: CaseRole[];
  teamId: string;
  sourceCaseId: string;
  targetCaseIds: string[];
}): { caseId: string; role: CaseRoleSlot; personId: string }[] {
  const source = input.roles.filter(
    (r) =>
      r.team_id === input.teamId &&
      r.case_id === input.sourceCaseId &&
      CASE_ROLE_SLOTS.includes(r.role as CaseRoleSlot),
  );
  const out: { caseId: string; role: CaseRoleSlot; personId: string }[] = [];
  for (const caseId of input.targetCaseIds) {
    if (caseId === input.sourceCaseId) continue;
    for (const r of source) {
      out.push({
        caseId,
        role: r.role as CaseRoleSlot,
        personId: r.person_id,
      });
    }
  }
  return out;
}

/**
 * Random fair split: honor ranked preferences first, then fill remaining
 * lead slots from people who marked "any case is fine", balancing lead load.
 * Deterministic when seed is provided (tests); otherwise shuffled.
 */
export function planRandomFairSplit(input: {
  caseIds: string[];
  personIds: string[];
  prefs: { personId: string; caseId: string; rank: number }[];
  anyCasePersonIds: string[];
  /** Existing roles to keep (non-lead slots / already set leads). */
  existing?: { caseId: string; role: CaseRoleSlot; personId: string }[];
  seed?: number;
}): { caseId: string; role: CaseRoleSlot; personId: string }[] {
  const out: { caseId: string; role: CaseRoleSlot; personId: string }[] = [];
  const leadCount = new Map(input.personIds.map((id) => [id, 0]));
  const caseLeads = new Map<string, string[]>();

  for (const caseId of input.caseIds) {
    caseLeads.set(caseId, []);
  }

  // Keep existing lead assignments if present
  for (const e of input.existing ?? []) {
    if (e.role !== "lead_1" && e.role !== "lead_2") continue;
    if (!input.caseIds.includes(e.caseId)) continue;
    const leads = caseLeads.get(e.caseId) ?? [];
    if (leads.includes(e.personId) || leads.length >= 2) continue;
    leads.push(e.personId);
    caseLeads.set(e.caseId, leads);
    leadCount.set(e.personId, (leadCount.get(e.personId) ?? 0) + 1);
    out.push(e);
  }

  const rankedPeople = new Set(input.prefs.map((p) => p.personId));
  const anySet = new Set(input.anyCasePersonIds);

  // Pass 1: honor preferences (people who ranked, not "any case")
  const prefPeople = input.personIds.filter(
    (id) => rankedPeople.has(id) && !anySet.has(id),
  );
  // Sort each person's cases by rank
  const prefsByPerson = new Map<string, { caseId: string; rank: number }[]>();
  for (const p of input.prefs) {
    if (anySet.has(p.personId)) continue;
    const list = prefsByPerson.get(p.personId) ?? [];
    list.push({ caseId: p.caseId, rank: p.rank });
    prefsByPerson.set(p.personId, list);
  }
  for (const list of prefsByPerson.values()) {
    list.sort((a, b) => a.rank - b.rank);
  }

  // Assign preferred people in order of lightest current load, walking their ranks
  const prefOrder = [...prefPeople].sort(
    (a, b) => (leadCount.get(a) ?? 0) - (leadCount.get(b) ?? 0),
  );
  for (const personId of prefOrder) {
    const wants = prefsByPerson.get(personId) ?? [];
    for (const w of wants) {
      const leads = caseLeads.get(w.caseId) ?? [];
      if (leads.length >= 2) continue;
      if (leads.includes(personId)) continue;
      const role: CaseRoleSlot = leads.length === 0 ? "lead_1" : "lead_2";
      leads.push(personId);
      caseLeads.set(w.caseId, leads);
      leadCount.set(personId, (leadCount.get(personId) ?? 0) + 1);
      out.push({ caseId: w.caseId, role, personId });
      break; // one preferred lead assignment per pass; balance via round
    }
  }

  // Second walk for preference people who still want another lead slot
  for (const personId of prefOrder) {
    const wants = prefsByPerson.get(personId) ?? [];
    for (const w of wants) {
      const leads = caseLeads.get(w.caseId) ?? [];
      if (leads.length >= 2 || leads.includes(personId)) continue;
      // Prefer filling cases that still need a first lead
      if (leads.length === 0 || (leadCount.get(personId) ?? 0) < 2) {
        const role: CaseRoleSlot = leads.length === 0 ? "lead_1" : "lead_2";
        leads.push(personId);
        caseLeads.set(w.caseId, leads);
        leadCount.set(personId, (leadCount.get(personId) ?? 0) + 1);
        out.push({ caseId: w.caseId, role, personId });
      }
    }
  }

  // Pass 2: fill remaining lead slots from "any case" pool
  const pool = shuffleIds(
    input.anyCasePersonIds.filter((id) => input.personIds.includes(id)),
    input.seed ?? Date.now() % 1_000_000,
  );

  for (const caseId of input.caseIds) {
    const leads = caseLeads.get(caseId) ?? [];
    while (leads.length < 2) {
      const candidates = [...pool].sort(
        (a, b) =>
          (leadCount.get(a) ?? 0) - (leadCount.get(b) ?? 0) ||
          a.localeCompare(b),
      );
      const pick = candidates.find((id) => !leads.includes(id));
      if (!pick) break;
      const role: CaseRoleSlot = leads.length === 0 ? "lead_1" : "lead_2";
      leads.push(pick);
      caseLeads.set(caseId, leads);
      leadCount.set(pick, (leadCount.get(pick) ?? 0) + 1);
      out.push({ caseId, role, personId: pick });
    }
  }

  // Counter-arguer: lightest load not already on the case
  for (const caseId of input.caseIds) {
    const used = new Set(caseLeads.get(caseId) ?? []);
    const existingCounter = (input.existing ?? []).find(
      (e) => e.caseId === caseId && e.role === "counter_arguer",
    );
    if (existingCounter) {
      out.push(existingCounter);
      continue;
    }
    const counter = [...input.personIds]
      .filter((id) => !used.has(id))
      .sort(
        (a, b) =>
          (leadCount.get(a) ?? 0) - (leadCount.get(b) ?? 0) ||
          a.localeCompare(b),
      )[0];
    if (counter) {
      out.push({ caseId, role: "counter_arguer", personId: counter });
    }
  }

  return out;
}

/**
 * Fill empty role slots only. Keeps every cell already filled.
 * Used by "Shuffle the rest" and per-case "Shuffle this case".
 */
export function planFillEmptySlots(input: {
  caseIds: string[];
  personIds: string[];
  existing: { caseId: string; role: CaseRoleSlot; personId: string }[];
  seed?: number;
}): { caseId: string; role: CaseRoleSlot; personId: string }[] {
  const out: { caseId: string; role: CaseRoleSlot; personId: string }[] = [];
  const roleCount = new Map(input.personIds.map((id) => [id, 0]));
  const onCase = new Map<string, Set<string>>();
  const filled = new Map<string, Set<CaseRoleSlot>>();

  for (const caseId of input.caseIds) {
    onCase.set(caseId, new Set());
    filled.set(caseId, new Set());
  }

  for (const e of input.existing) {
    if (!input.caseIds.includes(e.caseId)) continue;
    onCase.get(e.caseId)?.add(e.personId);
    filled.get(e.caseId)?.add(e.role);
    roleCount.set(e.personId, (roleCount.get(e.personId) ?? 0) + 1);
  }

  const order = shuffleIds(
    [...input.personIds],
    input.seed ?? Date.now() % 1_000_000,
  );

  for (const caseId of input.caseIds) {
    const used = onCase.get(caseId) ?? new Set();
    const have = filled.get(caseId) ?? new Set();
    for (const role of CASE_ROLE_SLOTS) {
      if (have.has(role)) continue;
      const candidates = [...order].sort(
        (a, b) =>
          (roleCount.get(a) ?? 0) - (roleCount.get(b) ?? 0) ||
          a.localeCompare(b),
      );
      const pick = candidates.find((id) => !used.has(id));
      if (!pick) break;
      used.add(pick);
      have.add(role);
      roleCount.set(pick, (roleCount.get(pick) ?? 0) + 1);
      out.push({ caseId, role, personId: pick });
    }
  }
  return out;
}

function shuffleIds(ids: string[], seed: number): string[] {
  const arr = [...ids];
  let s = seed || 1;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Preference template: assign lead_1 (and lead_2 when enough people) by
 * ranked preferences, balancing load. Each person gets preferred cases first
 * among those still needing a lead.
 */
export function planByPreference(input: {
  caseIds: string[];
  personIds: string[];
  /** Lower rank = more preferred. */
  prefs: { personId: string; caseId: string; rank: number }[];
}): { caseId: string; role: CaseRoleSlot; personId: string }[] {
  const out: { caseId: string; role: CaseRoleSlot; personId: string }[] = [];
  const leadCount = new Map(input.personIds.map((id) => [id, 0]));
  const caseLeads = new Map<string, string[]>(); // caseId -> personIds assigned as leads

  const sortedCases = [...input.caseIds];
  for (const caseId of sortedCases) {
    const assigned: string[] = [];
    // Candidates sorted by preference rank then current lead load
    const candidates = input.personIds
      .map((personId) => {
        const pref = input.prefs.find(
          (p) => p.personId === personId && p.caseId === caseId,
        );
        return {
          personId,
          rank: pref?.rank ?? 999,
          load: leadCount.get(personId) ?? 0,
        };
      })
      .sort((a, b) => a.rank - b.rank || a.load - b.load);

    for (const c of candidates) {
      if (assigned.length >= 2) break;
      if (assigned.includes(c.personId)) continue;
      const role: CaseRoleSlot = assigned.length === 0 ? "lead_1" : "lead_2";
      assigned.push(c.personId);
      leadCount.set(c.personId, (leadCount.get(c.personId) ?? 0) + 1);
      out.push({ caseId, role, personId: c.personId });
    }
    caseLeads.set(caseId, assigned);

    // Counter-arguer: lightest load person not already on the case
    const used = new Set(assigned);
    const counter = [...input.personIds]
      .filter((id) => !used.has(id))
      .sort(
        (a, b) => (leadCount.get(a) ?? 0) - (leadCount.get(b) ?? 0),
      )[0];
    if (counter) {
      out.push({ caseId, role: "counter_arguer", personId: counter });
    }
  }
  return out;
}

export function plainRoleChange(input: {
  actorName: string;
  personName: string;
  role: RoleChip;
  caseNumber: number;
  caseTitle: string;
}): string {
  if (input.role === "none") {
    return `${input.actorName} cleared ${input.personName}'s role on Case ${input.caseNumber} (${input.caseTitle}).`;
  }
  return `${input.actorName} set ${input.personName} as ${CASE_ROLE_LABELS[input.role]} on Case ${input.caseNumber} (${input.caseTitle}).`;
}

/**
 * Who should get a role-change notification.
 * Previous holder and new assignee (never the actor about their own edit).
 * Matches Workstream I helper roleChangeNotifyPersonIds (#61).
 */
export function roleChangeNotifyPersonIds(opts: {
  actorId: string;
  previousPersonId: string | null | undefined;
  nextPersonId: string | null | undefined;
}): string[] {
  const ids = new Set<string>();
  const prev = opts.previousPersonId ?? null;
  const next = opts.nextPersonId ?? null;
  if (prev && prev !== next) ids.add(prev);
  if (next && next !== prev) ids.add(next);
  ids.delete(opts.actorId);
  return [...ids];
}
