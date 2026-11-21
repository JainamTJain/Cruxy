/**
 * Mastery map data access (Workstream E Wave 6).
 * Persists grid cells in mastery_map_cells (00033).
 * Reads F's node_mastery (claim_id) as card-review evidence.
 * Soft-reads K's arg_edges when present.
 */
import "server-only";
import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore, updateStore } from "@/lib/db/sample-store";
import type { ArgEdge } from "@/lib/graph/types";
import {
  buildMasteryRows,
  listClaimNodesForCase,
} from "@/lib/mastery/compute";
import {
  masteryBand,
  type ClaimNodeRef,
  type FNodeMastery,
  type MasteryCell,
  type MasteryMapCellRow,
  type MasteryMapView,
} from "@/lib/mastery/types";
import { nowIso } from "@/lib/utils";

async function loadArgEdges(caseId?: string): Promise<ArgEdge[] | null> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const edges = (store as { arg_edges?: ArgEdge[] }).arg_edges;
    if (!edges?.length) return null;
    if (!caseId) return edges;
    return edges.filter((e) => !e.case_id || e.case_id === caseId);
  }
  try {
    const { getServiceSupabase } = await import("@/lib/db/supabase/client");
    let q = getServiceSupabase()
      .from("arg_edges")
      .select("*")
      .limit(5000);
    if (caseId) q = q.or(`case_id.eq.${caseId},case_id.is.null`);
    const { data, error } = await q;
    if (error) return null;
    return (data as ArgEdge[]) ?? null;
  } catch {
    return null;
  }
}

async function loadFNodeMastery(opts: {
  personIds: string[];
  claimIds: string[];
}): Promise<FNodeMastery[]> {
  if (!opts.personIds.length || !opts.claimIds.length) return [];
  if (isSampleDataMode()) {
    const store = await readStore();
    const rows = (store.node_mastery ?? []) as FNodeMastery[];
    return rows.filter(
      (r) =>
        opts.personIds.includes(r.person_id) &&
        opts.claimIds.includes(r.claim_id),
    );
  }
  try {
    const { getServiceSupabase } = await import("@/lib/db/supabase/client");
    const { data, error } = await getServiceSupabase()
      .from("node_mastery")
      .select("id,person_id,claim_id,mastery,review_count,last_grade,updated_at,created_at")
      .in("person_id", opts.personIds)
      .in("claim_id", opts.claimIds);
    if (error) return [];
    return (data as FNodeMastery[]) ?? [];
  } catch {
    return [];
  }
}

async function readStoredMastery(filter: {
  caseId: string;
  teamId?: string | null;
  personIds?: string[];
}): Promise<MasteryMapCellRow[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const rows = (store.mastery_map_cells ?? []) as MasteryMapCellRow[];
    return rows.filter((r) => {
      if (r.case_id !== filter.caseId) return false;
      if (filter.teamId && r.team_id && r.team_id !== filter.teamId) return false;
      if (filter.personIds && !filter.personIds.includes(r.person_id)) {
        return false;
      }
      return true;
    });
  }
  const { getServiceSupabase } = await import("@/lib/db/supabase/client");
  let q = getServiceSupabase()
    .from("mastery_map_cells")
    .select("*")
    .eq("case_id", filter.caseId);
  if (filter.teamId) q = q.eq("team_id", filter.teamId);
  if (filter.personIds?.length) q = q.in("person_id", filter.personIds);
  const { data, error } = await q;
  if (error) return [];
  return (data as MasteryMapCellRow[]) ?? [];
}

async function upsertMasteryRows(rows: MasteryMapCellRow[]): Promise<void> {
  if (!rows.length) return;
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = (s.mastery_map_cells ??= []);
      for (const row of rows) {
        const i = bag.findIndex(
          (r) =>
            r.person_id === row.person_id &&
            r.node_kind === row.node_kind &&
            r.node_id === row.node_id,
        );
        if (i >= 0) bag[i] = row;
        else bag.push(row);
      }
    });
    return;
  }
  const { getServiceSupabase } = await import("@/lib/db/supabase/client");
  const sb = getServiceSupabase();
  for (const row of rows) {
    await sb.from("mastery_map_cells").upsert(
      {
        person_id: row.person_id,
        team_id: row.team_id,
        case_id: row.case_id,
        node_kind: row.node_kind,
        node_id: row.node_id,
        mastery: row.mastery,
        evidence: row.evidence,
        updated_at: row.updated_at,
      },
      { onConflict: "person_id,node_kind,node_id" },
    );
  }
}

/** Recompute mastery for people on a case from live activity, then persist. */
export async function recomputeMasteryForCase(input: {
  caseId: string;
  teamId: string | null;
  personIds: string[];
}): Promise<MasteryMapCellRow[]> {
  const edges = await loadArgEdges(input.caseId);
  const store = isSampleDataMode()
    ? await readStore()
    : await loadLiveSlice(input.caseId);
  const nodes = listClaimNodesForCase(
    store,
    input.caseId,
    input.teamId,
    edges,
  );
  const claimIds = nodes
    .filter((n) => n.node_kind === "claim")
    .map((n) => n.node_id);
  const fRows = await loadFNodeMastery({
    personIds: input.personIds,
    claimIds,
  });
  const stamp = nowIso();
  const out: MasteryMapCellRow[] = [];
  for (const personId of input.personIds) {
    const built = buildMasteryRows({
      store,
      personId,
      teamId: input.teamId,
      caseId: input.caseId,
      nodes,
      nowIso: stamp,
      edges,
      fNodeMastery: fRows.filter((r) => r.person_id === personId),
    });
    for (const row of built) {
      // Skip pure-empty rows (no evidence); keep grid empty
      if (!row.evidence.card_reviews && !row.evidence.answers && !row.evidence.round_hits) {
        continue;
      }
      out.push({ id: randomUUID(), ...row });
    }
  }
  await upsertMasteryRows(out);
  return out;
}

async function loadLiveSlice(caseId: string) {
  const { getServiceSupabase } = await import("@/lib/db/supabase/client");
  const sb = getServiceSupabase();
  const [
    claims,
    supports,
    counterclaims,
    truth,
    flashcards,
    reviews,
    questions,
    answers,
    maps,
    rounds,
    feedback,
  ] = await Promise.all([
    sb.from("claims").select("*").eq("case_id", caseId),
    sb.from("supports").select("*").eq("case_id", caseId),
    sb.from("counterclaims").select("*").eq("case_id", caseId),
    sb.from("truth_items").select("*").eq("case_id", caseId),
    sb.from("flashcards").select("*").eq("case_id", caseId),
    sb.from("card_reviews").select("*"),
    sb.from("questions").select("*").eq("case_id", caseId),
    sb.from("answers").select("*"),
    sb.from("claim_map_versions").select("*").eq("case_id", caseId),
    sb.from("rounds").select("*").eq("case_id", caseId),
    sb.from("feedback_items").select("*"),
  ]);
  return {
    claims: claims.data ?? [],
    supports: supports.data ?? [],
    counterclaims: counterclaims.data ?? [],
    truth_items: truth.data ?? [],
    flashcards: flashcards.data ?? [],
    card_reviews: reviews.data ?? [],
    questions: questions.data ?? [],
    answers: answers.data ?? [],
    claim_map_versions: maps.data ?? [],
    practice_rounds: rounds.data ?? [],
    feedback_items: feedback.data ?? [],
    transcript_lines: [],
    files: [],
  } as unknown as Awaited<ReturnType<typeof readStore>>;
}

export type MasteryAccess =
  | { scope: "admin" }
  | { scope: "lead"; teamId: string; caseIds: string[] }
  /** Member: only their own row on cases they can open. */
  | { scope: "self"; personId: string; teamId: string }
  | { scope: "none" };

export async function resolveMasteryAccess(input: {
  personId: string;
  role: string;
  adminView: boolean;
  teamId: string | null;
}): Promise<MasteryAccess> {
  if (
    input.adminView &&
    (input.role === "tech_admin" || input.role === "coach_admin")
  ) {
    return { scope: "admin" };
  }
  if (!input.teamId) return { scope: "none" };

  if (isSampleDataMode()) {
    const store = await readStore();
    const leadCases = store.case_roles
      .filter(
        (r) =>
          r.person_id === input.personId &&
          r.team_id === input.teamId &&
          (r.role === "lead_1" || r.role === "lead_2"),
      )
      .map((r) => r.case_id);
    if (leadCases.length) {
      return {
        scope: "lead",
        teamId: input.teamId,
        caseIds: [...new Set(leadCases)],
      };
    }
    return {
      scope: "self",
      personId: input.personId,
      teamId: input.teamId,
    };
  }

  const { getServiceSupabase } = await import("@/lib/db/supabase/client");
  const { data } = await getServiceSupabase()
    .from("case_roles")
    .select("case_id,role")
    .eq("person_id", input.personId)
    .eq("team_id", input.teamId);
  const leadCases = (data ?? [])
    .filter((r) => r.role === "lead_1" || r.role === "lead_2")
    .map((r) => r.case_id as string);
  if (leadCases.length) {
    return {
      scope: "lead",
      teamId: input.teamId,
      caseIds: [...new Set(leadCases)],
    };
  }
  return {
    scope: "self",
    personId: input.personId,
    teamId: input.teamId,
  };
}

export async function getMasteryMap(input: {
  caseId: string;
  teamId: string | null;
  /** When admin viewing all teams, pass null teamId and allTeamPeople. */
  access: MasteryAccess;
}): Promise<MasteryMapView> {
  const store = isSampleDataMode()
    ? await readStore()
    : await loadLiveSlice(input.caseId);

  let caseRow = isSampleDataMode()
    ? (await readStore()).cases.find((c) => c.id === input.caseId)
    : null;
  if (!isSampleDataMode()) {
    const { getServiceSupabase } = await import("@/lib/db/supabase/client");
    const { data } = await getServiceSupabase()
      .from("cases")
      .select("id,number,title")
      .eq("id", input.caseId)
      .maybeSingle();
    caseRow = data as typeof caseRow;
  }

  const edges = await loadArgEdges(input.caseId);

  if (input.access.scope === "none") {
    return {
      caseId: input.caseId,
      caseNumber: caseRow?.number ?? 0,
      caseTitle: caseRow?.title ?? "Case",
      teamId: input.teamId,
      teamName: null,
      scope: "none",
      nodes: [],
      people: [],
      cells: [],
      emptyNodes: true,
      emptyActivity: true,
    };
  }

  const full = isSampleDataMode() ? await readStore() : null;
  const teams = full?.teams ?? [];
  let people: {
    id: string;
    name: string;
    team_id: string | null;
    team_name: string | null;
  }[] = [];

  if (input.access.scope === "admin") {
    if (full) {
      people = full.people
        .filter((p) => p.team_id && (!input.teamId || p.team_id === input.teamId))
        .map((p) => ({
          id: p.id,
          name: p.name,
          team_id: p.team_id,
          team_name: teams.find((t) => t.id === p.team_id)?.name ?? null,
        }));
    } else {
      const { getServiceSupabase } = await import("@/lib/db/supabase/client");
      let peepsQ = getServiceSupabase().from("people").select("id,name,team_id");
      if (input.teamId) peepsQ = peepsQ.eq("team_id", input.teamId);
      const [{ data: peeps }, { data: tms }] = await Promise.all([
        peepsQ,
        getServiceSupabase().from("teams").select("id,name"),
      ]);
      const tmap = new Map((tms ?? []).map((t) => [t.id as string, t.name as string]));
      people = (peeps ?? [])
        .filter((p) => p.team_id)
        .map((p) => ({
          id: p.id as string,
          name: p.name as string,
          team_id: p.team_id as string,
          team_name: tmap.get(p.team_id as string) ?? null,
        }));
    }
  } else if (input.access.scope === "self") {
    const teamId = input.access.teamId;
    const personId = input.access.personId;
    if (full) {
      const me = full.people.find((p) => p.id === personId);
      if (me) {
        people = [
          {
            id: me.id,
            name: me.name,
            team_id: me.team_id,
            team_name: teams.find((t) => t.id === teamId)?.name ?? null,
          },
        ];
      }
    } else {
      const { getServiceSupabase } = await import("@/lib/db/supabase/client");
      const [{ data: peep }, { data: tm }] = await Promise.all([
        getServiceSupabase()
          .from("people")
          .select("id,name,team_id")
          .eq("id", personId)
          .maybeSingle(),
        getServiceSupabase()
          .from("teams")
          .select("id,name")
          .eq("id", teamId)
          .maybeSingle(),
      ]);
      if (peep) {
        people = [
          {
            id: peep.id as string,
            name: peep.name as string,
            team_id: (peep.team_id as string) ?? teamId,
            team_name: (tm?.name as string) ?? null,
          },
        ];
      }
    }
  } else {
    const teamId = input.access.teamId;
    if (full) {
      people = full.people
        .filter((p) => p.team_id === teamId)
        .map((p) => ({
          id: p.id,
          name: p.name,
          team_id: p.team_id,
          team_name: teams.find((t) => t.id === teamId)?.name ?? null,
        }));
    } else {
      const { getServiceSupabase } = await import("@/lib/db/supabase/client");
      const { data: peeps } = await getServiceSupabase()
        .from("people")
        .select("id,name,team_id")
        .eq("team_id", teamId);
      const { data: tm } = await getServiceSupabase()
        .from("teams")
        .select("id,name")
        .eq("id", teamId)
        .maybeSingle();
      people = (peeps ?? []).map((p) => ({
        id: p.id as string,
        name: p.name as string,
        team_id: p.team_id as string,
        team_name: (tm?.name as string) ?? null,
      }));
    }
  }

  // Nodes: for admin all-teams view, union nodes per team or use unscoped claims
  const teamIdForNodes =
    input.access.scope === "lead" || input.access.scope === "self"
      ? input.access.teamId
      : input.teamId;
  const nodes: ClaimNodeRef[] = listClaimNodesForCase(
    store,
    input.caseId,
    teamIdForNodes,
    edges,
  );

  // Recompute from activity for visible people (real data only)
  const personIds = people.map((p) => p.id);
  if (input.access.scope === "admin" && !teamIdForNodes) {
    // Per-team recompute
    const byTeam = new Map<string, string[]>();
    for (const p of people) {
      if (!p.team_id) continue;
      const arr = byTeam.get(p.team_id) ?? [];
      arr.push(p.id);
      byTeam.set(p.team_id, arr);
    }
    for (const [tid, ids] of byTeam) {
      await recomputeMasteryForCase({
        caseId: input.caseId,
        teamId: tid,
        personIds: ids,
      });
    }
  } else {
    await recomputeMasteryForCase({
      caseId: input.caseId,
      teamId: teamIdForNodes,
      personIds,
    });
  }

  const stored = await readStoredMastery({
    caseId: input.caseId,
    teamId: teamIdForNodes,
    personIds,
  });

  const cells: MasteryCell[] = [];
  for (const person of people) {
    for (const node of nodes) {
      const row = stored.find(
        (r) =>
          r.person_id === person.id &&
          r.node_id === node.node_id &&
          r.node_kind === node.node_kind,
      );
      const hasEvidence =
        row &&
        (row.evidence?.card_reviews ||
          row.evidence?.answers ||
          row.evidence?.round_hits);
      const mastery = hasEvidence ? row!.mastery : null;
      cells.push({
        person_id: person.id,
        node_id: node.node_id,
        node_kind: node.node_kind,
        mastery,
        band: masteryBand(mastery),
        evidence: row?.evidence ?? {},
      });
    }
  }

  const teamName =
    people[0]?.team_name ??
    (teamIdForNodes && full
      ? full.teams.find((t) => t.id === teamIdForNodes)?.name ?? null
      : null);

  return {
    caseId: input.caseId,
    caseNumber: caseRow?.number ?? 0,
    caseTitle: caseRow?.title ?? "Case",
    teamId: teamIdForNodes,
    teamName,
    scope: input.access.scope,
    nodes,
    people,
    cells,
    emptyNodes: nodes.length === 0,
    emptyActivity: cells.every((c) => c.band === "empty"),
  };
}

export async function listMasteryCases(access: MasteryAccess): Promise<
  { id: string; number: number; title: string }[]
> {
  if (access.scope === "none") return [];
  if (isSampleDataMode()) {
    const store = await readStore();
    const active = store.cases.filter((c) => c.active);
    if (access.scope === "lead") {
      return active
        .filter((c) => access.caseIds.includes(c.id))
        .map((c) => ({ id: c.id, number: c.number, title: c.title }));
    }
    return active.map((c) => ({
      id: c.id,
      number: c.number,
      title: c.title,
    }));
  }
  const { getServiceSupabase } = await import("@/lib/db/supabase/client");
  const { data } = await getServiceSupabase()
    .from("cases")
    .select("id,number,title")
    .eq("active", true)
    .order("number");
  const rows = (data ?? []) as { id: string; number: number; title: string }[];
  if (access.scope === "lead") {
    return rows.filter((c) => access.caseIds.includes(c.id));
  }
  return rows;
}
