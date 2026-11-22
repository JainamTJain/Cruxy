/**
 * Wave 7 E: Roles board data access (preferences, clear, bulk apply, notify).
 */
import "server-only";
import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { createNotification } from "@/lib/db/supabase/auth-extra";
import { logActivity } from "@/lib/db/repository";
import { readStore, updateStore } from "@/lib/db/sample-store";
import {
  listCaseRoles,
  setCaseRole,
} from "@/lib/team/repository";
import {
  CASE_ROLE_LABELS,
  CASE_ROLE_SLOTS,
  type CaseRole,
  type CaseRoleSlot,
} from "@/lib/team/types";
import {
  computeLoad,
  findGaps,
  plainRoleChange,
  planByPreference,
  planCopyCase,
  planRoundRobin,
  planSamePairs,
  roleChangeNotifyPersonIds,
  roleForPersonOnCase,
  type CaseRolePreference,
  type RoleChip,
  type RolesBoardView,
} from "@/lib/team/roles-board";
import { nowIso } from "@/lib/utils";

export type { CaseRolePreference, RolesBoardView };

async function listPreferences(teamId: string): Promise<CaseRolePreference[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const bag = (store as { case_role_preferences?: CaseRolePreference[] })
      .case_role_preferences;
    return (bag ?? []).filter((p) => p.team_id === teamId);
  }
  try {
    const { getServiceSupabase } = await import("@/lib/db/supabase/client");
    const { data, error } = await getServiceSupabase()
      .from("case_role_preferences")
      .select("*")
      .eq("team_id", teamId)
      .order("rank");
    if (error) return [];
    return (data as CaseRolePreference[]) ?? [];
  } catch {
    return [];
  }
}

export async function savePreferences(input: {
  teamId: string;
  personId: string;
  ranks: { caseId: string; rank: number }[];
  actorId: string;
}): Promise<CaseRolePreference[]> {
  const stamp = nowIso();
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = ((
        s as { case_role_preferences?: CaseRolePreference[] }
      ).case_role_preferences ??= []);
      for (const r of input.ranks) {
        const i = bag.findIndex(
          (p) =>
            p.person_id === input.personId &&
            p.team_id === input.teamId &&
            p.case_id === r.caseId,
        );
        const row: CaseRolePreference = {
          id: i >= 0 ? bag[i]!.id : randomUUID(),
          team_id: input.teamId,
          person_id: input.personId,
          case_id: r.caseId,
          rank: r.rank,
          updated_at: stamp,
          updated_by: input.actorId,
        };
        if (i >= 0) bag[i] = row;
        else bag.push(row);
      }
    });
  } else {
    const { getServiceSupabase } = await import("@/lib/db/supabase/client");
    const sb = getServiceSupabase();
    for (const r of input.ranks) {
      await sb.from("case_role_preferences").upsert(
        {
          team_id: input.teamId,
          person_id: input.personId,
          case_id: r.caseId,
          rank: r.rank,
          updated_at: stamp,
          updated_by: input.actorId,
        },
        { onConflict: "person_id,team_id,case_id" },
      );
    }
  }
  await logActivity({
    person_id: input.actorId,
    action: "case_role_preferences_saved",
    target: input.teamId,
    meta: { person_id: input.personId, count: input.ranks.length },
  });
  return listPreferences(input.teamId);
}

export async function getRolesBoard(input: {
  teamId: string;
  canEdit: boolean;
}): Promise<RolesBoardView> {
  const roles = await listCaseRoles(input.teamId);
  let people: { id: string; name: string }[] = [];
  let cases: RolesBoardView["cases"] = [];
  let teamName = "Team";

  if (isSampleDataMode()) {
    const store = await readStore();
    teamName = store.teams.find((t) => t.id === input.teamId)?.name ?? "Team";
    people = store.people
      .filter((p) => p.team_id === input.teamId)
      .map((p) => ({ id: p.id, name: p.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    cases = store.cases
      .slice()
      .sort((a, b) => a.number - b.number)
      .map((c) => ({
        id: c.id,
        number: c.number,
        title: c.title,
        active: c.active,
      }));
  } else {
    const { getServiceSupabase } = await import("@/lib/db/supabase/client");
    const sb = getServiceSupabase();
    const [{ data: peeps }, { data: caseRows }, { data: tm }] =
      await Promise.all([
        sb
          .from("people")
          .select("id,name")
          .eq("team_id", input.teamId)
          .order("name"),
        sb.from("cases").select("id,number,title,active").order("number"),
        sb.from("teams").select("name").eq("id", input.teamId).maybeSingle(),
      ]);
    people = (peeps ?? []).map((p) => ({
      id: p.id as string,
      name: p.name as string,
    }));
    cases = (caseRows ?? []).map((c) => ({
      id: c.id as string,
      number: c.number as number,
      title: c.title as string,
      active: Boolean(c.active),
    }));
    teamName = (tm?.name as string) ?? "Team";
  }

  // Prefer the 12 regional cases when more exist: first 12 by number, or all
  const boardCases =
    cases.length > 12 ? cases.filter((c) => c.number <= 12) : cases;

  const cells: RolesBoardView["cells"] = {};
  for (const p of people) {
    cells[p.id] = {};
    for (const c of boardCases) {
      cells[p.id]![c.id] = roleForPersonOnCase(
        roles,
        input.teamId,
        c.id,
        p.id,
      );
    }
  }

  const preferences = await listPreferences(input.teamId);
  return {
    teamId: input.teamId,
    teamName,
    canEdit: input.canEdit,
    people,
    cases: boardCases,
    cells,
    load: computeLoad(
      roles,
      input.teamId,
      people.map((p) => p.id),
    ),
    gaps: findGaps({
      roles,
      teamId: input.teamId,
      cases: boardCases,
      people,
    }),
    preferences,
  };
}

async function notifyRoleChange(input: {
  personId: string;
  actorId: string;
  title: string;
  body: string;
  caseId: string;
}): Promise<void> {
  if (input.personId === input.actorId) return;
  try {
    await createNotification({
      personId: input.personId,
      kind: "case_role",
      title: input.title,
      body: input.body,
      href: "/team/roles",
      payload: { case_id: input.caseId },
      createdBy: input.actorId,
    });
  } catch {
    // Notification table may be missing in older envs; roles still save
  }
}

export async function clearCaseRole(input: {
  teamId: string;
  caseId: string;
  /** Clear this slot, or clear this person's role on the case. */
  role?: CaseRoleSlot;
  personId?: string;
  actorId: string;
}): Promise<void> {
  if (!input.role && !input.personId) {
    throw new Error("Need role or personId to clear");
  }

  let clearedPersonIds: string[] = [];
  let caseNumber = 0;
  let caseTitle = "Case";
  let actorName = "Someone";

  if (isSampleDataMode()) {
    await updateStore((s) => {
      const actor = s.people.find((p) => p.id === input.actorId);
      actorName = actor?.name ?? "Someone";
      const caseRow = s.cases.find((c) => c.id === input.caseId);
      caseNumber = caseRow?.number ?? 0;
      caseTitle = caseRow?.title ?? "Case";
      const before = s.case_roles.filter(
        (r) =>
          r.team_id === input.teamId &&
          r.case_id === input.caseId &&
          (input.role ? r.role === input.role : true) &&
          (input.personId ? r.person_id === input.personId : true),
      );
      clearedPersonIds = before.map((r) => r.person_id);
      s.case_roles = s.case_roles.filter(
        (r) =>
          !(
            r.team_id === input.teamId &&
            r.case_id === input.caseId &&
            (input.role ? r.role === input.role : true) &&
            (input.personId ? r.person_id === input.personId : true)
          ),
      );
    });
  } else {
    const { getServiceSupabase } = await import("@/lib/db/supabase/client");
    const sb = getServiceSupabase();
    const [{ data: actor }, { data: caseRow }, { data: existing }] =
      await Promise.all([
        sb
          .from("people")
          .select("name")
          .eq("id", input.actorId)
          .maybeSingle(),
        sb
          .from("cases")
          .select("number,title")
          .eq("id", input.caseId)
          .maybeSingle(),
        sb
          .from("case_roles")
          .select("person_id,role")
          .eq("team_id", input.teamId)
          .eq("case_id", input.caseId),
      ]);
    actorName = (actor?.name as string) ?? "Someone";
    caseNumber = (caseRow?.number as number) ?? 0;
    caseTitle = (caseRow?.title as string) ?? "Case";
    const matches = (existing ?? []).filter(
      (r) =>
        (input.role ? r.role === input.role : true) &&
        (input.personId ? r.person_id === input.personId : true),
    );
    clearedPersonIds = matches.map((r) => r.person_id as string);
    let q = sb
      .from("case_roles")
      .delete()
      .eq("team_id", input.teamId)
      .eq("case_id", input.caseId);
    if (input.role) q = q.eq("role", input.role);
    if (input.personId) q = q.eq("person_id", input.personId);
    await q;
  }

  await logActivity({
    person_id: input.actorId,
    action: "case_role_cleared",
    target: input.caseId,
    meta: {
      team_id: input.teamId,
      role: input.role ?? null,
      person_id: input.personId ?? null,
    },
  });

  for (const pid of [...new Set(clearedPersonIds)]) {
    const body = plainRoleChange({
      actorName,
      personName: "you",
      role: "none",
      caseNumber,
      caseTitle,
    }).replace(" you ", " your ");
    await notifyRoleChange({
      personId: pid,
      actorId: input.actorId,
      title: "Role cleared",
      body: `${actorName} cleared your role on Case ${caseNumber} (${caseTitle}).`,
      caseId: input.caseId,
    });
    void body;
  }
}

/** Set or clear one cell (person × case). */
export async function setBoardCell(input: {
  teamId: string;
  caseId: string;
  personId: string;
  role: RoleChip;
  actorId: string;
}): Promise<RolesBoardView> {
  if (input.role === "none") {
    await clearCaseRole({
      teamId: input.teamId,
      caseId: input.caseId,
      personId: input.personId,
      actorId: input.actorId,
    });
  } else {
    const before = await listCaseRoles(input.teamId);
    const previousHolder =
      before.find(
        (r) =>
          r.team_id === input.teamId &&
          r.case_id === input.caseId &&
          r.role === input.role,
      )?.person_id ?? null;

    const result = await setCaseRole({
      teamId: input.teamId,
      caseId: input.caseId,
      role: input.role,
      personId: input.personId,
      actorId: input.actorId,
    });

    const notifyIds = roleChangeNotifyPersonIds({
      actorId: input.actorId,
      previousPersonId: previousHolder,
      nextPersonId: input.personId,
    });
    for (const pid of notifyIds) {
      if (pid === input.personId) {
        await notifyRoleChange({
          personId: pid,
          actorId: input.actorId,
          title: `You are ${CASE_ROLE_LABELS[input.role]}`,
          body: result.chatMessage.body,
          caseId: input.caseId,
        });
      } else {
        await notifyRoleChange({
          personId: pid,
          actorId: input.actorId,
          title: "Role reassigned",
          body: `Your ${CASE_ROLE_LABELS[input.role]} role on this case was given to someone else.`,
          caseId: input.caseId,
        });
      }
    }
  }
  return getRolesBoard({ teamId: input.teamId, canEdit: true });
}

export async function applyRolePlan(input: {
  teamId: string;
  actorId: string;
  assignments: { caseId: string; role: CaseRoleSlot; personId: string }[];
  /** When true, clear all team roles on touched cases first. */
  replaceCases?: boolean;
}): Promise<RolesBoardView> {
  const touched = [...new Set(input.assignments.map((a) => a.caseId))];
  if (input.replaceCases) {
    for (const caseId of touched) {
      // Clear every slot on the case for this team
      for (const role of CASE_ROLE_SLOTS) {
        await clearCaseRole({
          teamId: input.teamId,
          caseId,
          role,
          actorId: input.actorId,
        });
      }
    }
  }
  for (const a of input.assignments) {
    const before = await listCaseRoles(input.teamId);
    const previousHolder =
      before.find(
        (r) =>
          r.team_id === input.teamId &&
          r.case_id === a.caseId &&
          r.role === a.role,
      )?.person_id ?? null;

    await setCaseRole({
      teamId: input.teamId,
      caseId: a.caseId,
      role: a.role,
      personId: a.personId,
      actorId: input.actorId,
    });

    const notifyIds = roleChangeNotifyPersonIds({
      actorId: input.actorId,
      previousPersonId: previousHolder,
      nextPersonId: a.personId,
    });
    for (const pid of notifyIds) {
      if (pid === a.personId) {
        await notifyRoleChange({
          personId: pid,
          actorId: input.actorId,
          title: `You are ${CASE_ROLE_LABELS[a.role]}`,
          body: `You were set as ${CASE_ROLE_LABELS[a.role]} on a case from the roles board.`,
          caseId: a.caseId,
        });
      } else {
        await notifyRoleChange({
          personId: pid,
          actorId: input.actorId,
          title: "Role reassigned",
          body: `Your ${CASE_ROLE_LABELS[a.role]} role on this case was given to someone else.`,
          caseId: a.caseId,
        });
      }
    }
  }
  await logActivity({
    person_id: input.actorId,
    action: "case_roles_bulk",
    target: input.teamId,
    meta: { count: input.assignments.length },
  });
  return getRolesBoard({ teamId: input.teamId, canEdit: true });
}

export async function clearRow(input: {
  teamId: string;
  personId: string;
  actorId: string;
}): Promise<RolesBoardView> {
  const roles = await listCaseRoles(input.teamId);
  const mine = roles.filter((r) => r.person_id === input.personId);
  for (const r of mine) {
    await clearCaseRole({
      teamId: input.teamId,
      caseId: r.case_id,
      personId: input.personId,
      actorId: input.actorId,
    });
  }
  return getRolesBoard({ teamId: input.teamId, canEdit: true });
}

export async function clearColumn(input: {
  teamId: string;
  caseId: string;
  actorId: string;
}): Promise<RolesBoardView> {
  for (const role of CASE_ROLE_SLOTS) {
    await clearCaseRole({
      teamId: input.teamId,
      caseId: input.caseId,
      role,
      actorId: input.actorId,
    });
  }
  return getRolesBoard({ teamId: input.teamId, canEdit: true });
}

export async function runTemplate(input: {
  teamId: string;
  actorId: string;
  kind: "same_pairs" | "round_robin" | "preference" | "copy_case";
  caseIds: string[];
  personIds: string[];
  samePairs?: Partial<Record<CaseRoleSlot, string | null>>;
  sourceCaseId?: string;
}): Promise<RolesBoardView> {
  const roles = await listCaseRoles(input.teamId);
  let plan: { caseId: string; role: CaseRoleSlot; personId: string }[] = [];

  if (input.kind === "same_pairs") {
    plan = planSamePairs({
      caseIds: input.caseIds,
      slots: input.samePairs ?? {},
    });
  } else if (input.kind === "round_robin") {
    plan = planRoundRobin({
      caseIds: input.caseIds,
      personIds: input.personIds,
    });
  } else if (input.kind === "copy_case") {
    if (!input.sourceCaseId) throw new Error("Pick a case to copy from");
    plan = planCopyCase({
      roles,
      teamId: input.teamId,
      sourceCaseId: input.sourceCaseId,
      targetCaseIds: input.caseIds,
    });
  } else {
    const prefs = await listPreferences(input.teamId);
    plan = planByPreference({
      caseIds: input.caseIds,
      personIds: input.personIds,
      prefs: prefs.map((p) => ({
        personId: p.person_id,
        caseId: p.case_id,
        rank: p.rank,
      })),
    });
  }

  return applyRolePlan({
    teamId: input.teamId,
    actorId: input.actorId,
    assignments: plan,
    replaceCases: true,
  });
}

export type { CaseRole };
