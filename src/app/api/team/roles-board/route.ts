import { NextResponse } from "next/server";
import { canSetCaseRole } from "@/lib/auth/capabilities";
import { getSession } from "@/lib/auth/session";
import { getPersonById, listTeams } from "@/lib/db/repository";
import {
  applyRolePlan,
  clearColumn,
  clearRow,
  getRolesBoard,
  lockForRegionals2026,
  runRandomFairSplit,
  runTemplate,
  savePreferences,
  setAnyCaseOk,
  setBoardCell,
  shuffleFillEmpty,
} from "@/lib/team/roles-board-repository";
import { CASE_ROLE_SLOTS, type CaseRoleSlot } from "@/lib/team/types";
import { nextRoleInCycle, type RoleChip } from "@/lib/team/roles-board";

export const runtime = "nodejs";

function resolveTeamId(
  person: { team_id: string | null },
  session: { teamId: string | null; adminView: boolean; role: string },
  requested: string | null,
): string | null {
  if (
    session.adminView &&
    (session.role === "tech_admin" || session.role === "coach_admin") &&
    requested
  ) {
    return requested;
  }
  return person.team_id ?? session.teamId ?? requested;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const teamId = resolveTeamId(
    person,
    session,
    url.searchParams.get("teamId"),
  );
  if (!teamId) {
    return NextResponse.json({ error: "No team" }, { status: 400 });
  }
  const canEdit = canSetCaseRole(person, session, teamId);
  const board = await getRolesBoard({ teamId, canEdit });
  const teams =
    session.adminView &&
    (person.role === "tech_admin" || person.role === "coach_admin")
      ? await listTeams()
      : [];
  return NextResponse.json({
    board,
    teams: teams.map((t) => ({ id: t.id, name: t.name, colour: t.colour })),
    me: { id: person.id, name: person.name },
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    action?: string;
    teamId?: string;
    caseId?: string;
    personId?: string;
    role?: string;
    cycle?: boolean;
    kind?: string;
    caseIds?: string[];
    personIds?: string[];
    samePairs?: Partial<Record<CaseRoleSlot, string | null>>;
    sourceCaseId?: string;
    ranks?: { caseId: string; rank: number }[];
    assignments?: { caseId: string; role: string; personId: string }[];
    anyCaseOk?: boolean;
    preview?: boolean;
  };

  const teamId = resolveTeamId(person, session, body.teamId ?? null);
  if (!teamId) {
    return NextResponse.json({ error: "No team" }, { status: 400 });
  }
  if (!canSetCaseRole(person, session, teamId)) {
    return NextResponse.json({ error: "Not on this team" }, { status: 403 });
  }

  try {
    const action = body.action ?? "set_cell";

    if (action === "set_cell") {
      if (!body.caseId || !body.personId) {
        return NextResponse.json({ error: "Missing fields" }, { status: 400 });
      }
      let role: RoleChip = (body.role as RoleChip) ?? "none";
      if (body.cycle) {
        const board = await getRolesBoard({ teamId, canEdit: true });
        const current =
          board.cells[body.personId]?.[body.caseId] ?? "none";
        role = nextRoleInCycle(current);
      }
      if (role !== "none" && !CASE_ROLE_SLOTS.includes(role as CaseRoleSlot)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      const board = await setBoardCell({
        teamId,
        caseId: body.caseId,
        personId: body.personId,
        role,
        actorId: session.personId,
      });
      return NextResponse.json({ board });
    }

    if (action === "clear_row") {
      if (!body.personId) {
        return NextResponse.json({ error: "Missing personId" }, { status: 400 });
      }
      const board = await clearRow({
        teamId,
        personId: body.personId,
        actorId: session.personId,
      });
      return NextResponse.json({ board });
    }

    if (action === "clear_column") {
      if (!body.caseId) {
        return NextResponse.json({ error: "Missing caseId" }, { status: 400 });
      }
      const board = await clearColumn({
        teamId,
        caseId: body.caseId,
        actorId: session.personId,
      });
      return NextResponse.json({ board });
    }

    if (action === "template") {
      const boardNow = await getRolesBoard({ teamId, canEdit: true });
      const caseIds = body.caseIds?.length
        ? body.caseIds
        : boardNow.cases.map((c) => c.id);
      const personIds = body.personIds?.length
        ? body.personIds
        : boardNow.people.map((p) => p.id);
      const kind = body.kind as
        | "same_pairs"
        | "round_robin"
        | "preference"
        | "copy_case";
      if (
        !["same_pairs", "round_robin", "preference", "copy_case"].includes(
          kind,
        )
      ) {
        return NextResponse.json({ error: "Unknown template" }, { status: 400 });
      }
      const board = await runTemplate({
        teamId,
        actorId: session.personId,
        kind,
        caseIds,
        personIds,
        samePairs: body.samePairs,
        sourceCaseId: body.sourceCaseId,
      });
      return NextResponse.json({ board });
    }

    if (action === "fix_gap") {
      if (!body.caseId || !body.personId || !body.role) {
        return NextResponse.json({ error: "Missing fields" }, { status: 400 });
      }
      if (!CASE_ROLE_SLOTS.includes(body.role as CaseRoleSlot)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      const board = await setBoardCell({
        teamId,
        caseId: body.caseId,
        personId: body.personId,
        role: body.role as CaseRoleSlot,
        actorId: session.personId,
      });
      return NextResponse.json({ board });
    }

    if (action === "save_preferences") {
      if (!body.personId || !body.ranks) {
        return NextResponse.json({ error: "Missing fields" }, { status: 400 });
      }
      // Members may only save their own ranks unless admin
      const targetPersonId =
        person.role === "tech_admin" || person.role === "coach_admin"
          ? body.personId
          : session.personId;
      await savePreferences({
        teamId,
        personId: targetPersonId,
        ranks: body.ranks,
        actorId: session.personId,
      });
      const board = await getRolesBoard({ teamId, canEdit: true });
      return NextResponse.json({ board });
    }

    if (action === "apply_plan") {
      const assignments = (body.assignments ?? [])
        .filter(
          (a) =>
            a.caseId &&
            a.personId &&
            CASE_ROLE_SLOTS.includes(a.role as CaseRoleSlot),
        )
        .map((a) => ({
          caseId: a.caseId,
          personId: a.personId,
          role: a.role as CaseRoleSlot,
        }));
      const board = await applyRolePlan({
        teamId,
        actorId: session.personId,
        assignments,
        replaceCases: true,
      });
      return NextResponse.json({ board });
    }

    if (action === "set_any_case") {
      const targetPersonId =
        person.role === "tech_admin" || person.role === "coach_admin"
          ? (body.personId ?? session.personId)
          : session.personId;
      await setAnyCaseOk({
        teamId,
        personId: targetPersonId,
        anyCaseOk: Boolean(body.anyCaseOk),
        actorId: session.personId,
      });
      const board = await getRolesBoard({ teamId, canEdit: true });
      return NextResponse.json({ board });
    }

    if (action === "random_fair_split") {
      const board = await runRandomFairSplit({
        teamId,
        actorId: session.personId,
        caseIds: body.caseIds,
        personIds: body.personIds,
      });
      return NextResponse.json({ board });
    }

    if (action === "lock_regionals_2026") {
      const board = await lockForRegionals2026({
        teamId,
        actorId: session.personId,
      });
      return NextResponse.json({ board });
    }

    if (action === "shuffle_rest" || action === "shuffle_case") {
      if (action === "shuffle_case" && !body.caseId) {
        return NextResponse.json({ error: "Missing caseId" }, { status: 400 });
      }
      const result = await shuffleFillEmpty({
        teamId,
        actorId: session.personId,
        caseIds:
          action === "shuffle_case" && body.caseId
            ? [body.caseId]
            : body.caseIds,
        preview: Boolean(body.preview),
      });
      return NextResponse.json({
        board: result.board,
        proposed: result.proposed,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 },
    );
  }
}
