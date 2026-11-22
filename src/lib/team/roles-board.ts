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
};

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

export function findGaps(input: {
  roles: CaseRole[];
  teamId: string;
  cases: { id: string; number: number }[];
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
    const onCase = input.roles.filter(
      (r) => r.team_id === input.teamId && r.case_id === c.id,
    );
    const missing: CaseRoleSlot[] = [];
    const hasLead =
      onCase.some((r) => r.role === "lead_1") ||
      onCase.some((r) => r.role === "lead_2");
    if (!hasLead) missing.push("lead_1");
    if (!onCase.some((r) => r.role === "counter_arguer")) {
      missing.push("counter_arguer");
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
