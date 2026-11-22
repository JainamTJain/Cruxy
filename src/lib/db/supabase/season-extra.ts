/**
 * Wave 9 H: seasons, results, retros, Nationals checklist, handoff.
 */
import "server-only";

import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import type {
  CompetitionTeamResult,
  NationalsChecklistItem,
  RetroCitationQuote,
  RetroCommentTheme,
  Season,
  SeasonHandoff,
  SeasonRetro,
  HandoffWhoDidWhat,
} from "@/lib/season/types";
import { nowIso } from "@/lib/utils";

function mapSeason(r: Record<string, unknown>): Season {
  return {
    id: String(r.id),
    label: String(r.label),
    status: (r.status as Season["status"]) ?? "active",
    competition_id: (r.competition_id as string | null) ?? null,
    archived_at: (r.archived_at as string | null) ?? null,
    archive_storage_path: (r.archive_storage_path as string | null) ?? null,
    created_at: String(r.created_at ?? nowIso()),
    created_by: (r.created_by as string | null) ?? null,
  };
}

function mapResult(r: Record<string, unknown>): CompetitionTeamResult {
  return {
    id: String(r.id),
    season_id: String(r.season_id),
    competition_id: (r.competition_id as string | null) ?? null,
    team_id: String(r.team_id),
    rounds_played: Number(r.rounds_played ?? 0),
    wins: Number(r.wins ?? 0),
    losses: Number(r.losses ?? 0),
    ties: Number(r.ties ?? 0),
    advanced: Boolean(r.advanced),
    advancement_note: (r.advancement_note as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    entered_by: (r.entered_by as string | null) ?? null,
    created_at: String(r.created_at ?? nowIso()),
    updated_at: String(r.updated_at ?? nowIso()),
  };
}

function mapRetro(r: Record<string, unknown>): SeasonRetro {
  return {
    id: String(r.id),
    season_id: String(r.season_id),
    team_id: String(r.team_id),
    what_worked: String(r.what_worked ?? ""),
    what_to_change: String(r.what_to_change ?? ""),
    cases_that_landed: String(r.cases_that_landed ?? ""),
    arguments_that_landed: String(r.arguments_that_landed ?? ""),
    status: (r.status as SeasonRetro["status"]) ?? "draft",
    created_by: (r.created_by as string | null) ?? null,
    updated_at: String(r.updated_at ?? nowIso()),
  };
}

function mapTheme(r: Record<string, unknown>): RetroCommentTheme {
  return {
    id: String(r.id),
    season_id: String(r.season_id),
    team_id: String(r.team_id),
    theme: String(r.theme),
    summary: String(r.summary),
    citation_log_ids: (r.citation_log_ids as string[]) ?? [],
    citation_quotes: (r.citation_quotes as RetroCitationQuote[]) ?? [],
    created_at: String(r.created_at ?? nowIso()),
    created_by: (r.created_by as string | null) ?? null,
  };
}

function mapChecklist(r: Record<string, unknown>): NationalsChecklistItem {
  return {
    id: String(r.id),
    season_id: String(r.season_id),
    team_id: String(r.team_id),
    label: String(r.label),
    detail: String(r.detail ?? ""),
    done: Boolean(r.done),
    sort_order: Number(r.sort_order ?? 0),
    created_at: String(r.created_at ?? nowIso()),
    updated_at: String(r.updated_at ?? nowIso()),
  };
}

function mapHandoff(r: Record<string, unknown>): SeasonHandoff {
  return {
    id: String(r.id),
    season_id: String(r.season_id),
    body: String(r.body ?? ""),
    who_did_what: (r.who_did_what as HandoffWhoDidWhat[]) ?? [],
    updated_at: String(r.updated_at ?? nowIso()),
    updated_by: (r.updated_by as string | null) ?? null,
  };
}

export async function listSeasons(): Promise<Season[]> {
  if (isSampleDataMode()) {
    const s = await readStore();
    return [...(s.seasons ?? [])].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
  }
  const { data, error } = await getServiceSupabase()
    .from("seasons")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listSeasons: ${error.message}`);
  return ((data as Record<string, unknown>[]) ?? []).map(mapSeason);
}

export async function getActiveSeason(): Promise<Season | null> {
  const all = await listSeasons();
  return all.find((s) => s.status === "active") ?? all[0] ?? null;
}

export async function getSeasonById(id: string): Promise<Season | null> {
  if (isSampleDataMode()) {
    return (await readStore()).seasons?.find((s) => s.id === id) ?? null;
  }
  const { data, error } = await getServiceSupabase()
    .from("seasons")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getSeasonById: ${error.message}`);
  return data ? mapSeason(data as Record<string, unknown>) : null;
}

export async function upsertSeason(input: {
  id?: string;
  label: string;
  competition_id?: string | null;
  created_by?: string | null;
}): Promise<Season> {
  const row: Season = {
    id: input.id ?? randomUUID(),
    label: input.label,
    status: "active",
    competition_id: input.competition_id ?? null,
    archived_at: null,
    archive_storage_path: null,
    created_at: nowIso(),
    created_by: input.created_by ?? null,
  };
  if (isSampleDataMode()) {
    const s = await readStore();
    const seasons = [...(s.seasons ?? [])];
    const i = seasons.findIndex((x) => x.id === row.id);
    if (i >= 0) seasons[i] = { ...seasons[i]!, ...row, status: seasons[i]!.status };
    else seasons.unshift(row);
    await updateStore(async (store) => {
      Object.assign(store, { seasons });
    });
    return seasons.find((x) => x.id === row.id)!;
  }
  const { data, error } = await getServiceSupabase()
    .from("seasons")
    .upsert({
      id: row.id,
      label: row.label,
      status: row.status,
      competition_id: row.competition_id,
      created_by: row.created_by,
    })
    .select("*")
    .single();
  if (error) throw new Error(`upsertSeason: ${error.message}`);
  return mapSeason(data as Record<string, unknown>);
}

export async function markSeasonArchived(input: {
  seasonId: string;
  archivePath: string | null;
}): Promise<Season> {
  const archived_at = nowIso();
  if (isSampleDataMode()) {
    const s = await readStore();
    const seasons = (s.seasons ?? []).map((x) =>
      x.id === input.seasonId
        ? {
            ...x,
            status: "archived" as const,
            archived_at,
            archive_storage_path: input.archivePath,
          }
        : x,
    );
    await updateStore(async (store) => {
      Object.assign(store, { seasons });
    });
    const found = seasons.find((x) => x.id === input.seasonId);
    if (!found) throw new Error("season not found");
    return found;
  }
  const { data, error } = await getServiceSupabase()
    .from("seasons")
    .update({
      status: "archived",
      archived_at,
      archive_storage_path: input.archivePath,
    })
    .eq("id", input.seasonId)
    .select("*")
    .single();
  if (error) throw new Error(`markSeasonArchived: ${error.message}`);
  return mapSeason(data as Record<string, unknown>);
}

export async function listTeamResults(
  seasonId: string,
): Promise<CompetitionTeamResult[]> {
  if (isSampleDataMode()) {
    return ((await readStore()).competition_team_results ?? []).filter(
      (r) => r.season_id === seasonId,
    );
  }
  const { data, error } = await getServiceSupabase()
    .from("competition_team_results")
    .select("*")
    .eq("season_id", seasonId);
  if (error) throw new Error(`listTeamResults: ${error.message}`);
  return ((data as Record<string, unknown>[]) ?? []).map(mapResult);
}

export async function upsertTeamResult(
  input: Omit<
    CompetitionTeamResult,
    "id" | "created_at" | "updated_at"
  > & { id?: string },
): Promise<CompetitionTeamResult> {
  const now = nowIso();
  const row: CompetitionTeamResult = {
    id: input.id ?? randomUUID(),
    season_id: input.season_id,
    competition_id: input.competition_id,
    team_id: input.team_id,
    rounds_played: input.rounds_played,
    wins: input.wins,
    losses: input.losses,
    ties: input.ties,
    advanced: input.advanced,
    advancement_note: input.advancement_note,
    notes: input.notes,
    entered_by: input.entered_by,
    created_at: now,
    updated_at: now,
  };
  if (isSampleDataMode()) {
    const s = await readStore();
    const list = [...(s.competition_team_results ?? [])];
    const i = list.findIndex(
      (x) => x.season_id === row.season_id && x.team_id === row.team_id,
    );
    if (i >= 0) {
      row.id = list[i]!.id;
      row.created_at = list[i]!.created_at;
      list[i] = row;
    } else list.push(row);
    await updateStore(async (store) => {
      Object.assign(store, { competition_team_results: list });
    });
    return row;
  }
  const { data, error } = await getServiceSupabase()
    .from("competition_team_results")
    .upsert(
      {
        season_id: row.season_id,
        competition_id: row.competition_id,
        team_id: row.team_id,
        rounds_played: row.rounds_played,
        wins: row.wins,
        losses: row.losses,
        ties: row.ties,
        advanced: row.advanced,
        advancement_note: row.advancement_note,
        notes: row.notes,
        entered_by: row.entered_by,
        updated_at: now,
      },
      { onConflict: "season_id,team_id" },
    )
    .select("*")
    .single();
  if (error) throw new Error(`upsertTeamResult: ${error.message}`);
  return mapResult(data as Record<string, unknown>);
}

export async function getRetro(
  seasonId: string,
  teamId: string,
): Promise<SeasonRetro | null> {
  if (isSampleDataMode()) {
    return (
      (await readStore()).season_retros?.find(
        (r) => r.season_id === seasonId && r.team_id === teamId,
      ) ?? null
    );
  }
  const { data, error } = await getServiceSupabase()
    .from("season_retros")
    .select("*")
    .eq("season_id", seasonId)
    .eq("team_id", teamId)
    .maybeSingle();
  if (error) throw new Error(`getRetro: ${error.message}`);
  return data ? mapRetro(data as Record<string, unknown>) : null;
}

export async function upsertRetro(
  input: Omit<SeasonRetro, "id" | "updated_at"> & { id?: string },
): Promise<SeasonRetro> {
  const row: SeasonRetro = {
    id: input.id ?? randomUUID(),
    season_id: input.season_id,
    team_id: input.team_id,
    what_worked: input.what_worked,
    what_to_change: input.what_to_change,
    cases_that_landed: input.cases_that_landed,
    arguments_that_landed: input.arguments_that_landed,
    status: input.status,
    created_by: input.created_by,
    updated_at: nowIso(),
  };
  if (isSampleDataMode()) {
    const s = await readStore();
    const list = [...(s.season_retros ?? [])];
    const i = list.findIndex(
      (x) => x.season_id === row.season_id && x.team_id === row.team_id,
    );
    if (i >= 0) {
      row.id = list[i]!.id;
      list[i] = row;
    } else list.push(row);
    await updateStore(async (store) => {
      Object.assign(store, { season_retros: list });
    });
    return row;
  }
  const { data, error } = await getServiceSupabase()
    .from("season_retros")
    .upsert(
      {
        season_id: row.season_id,
        team_id: row.team_id,
        what_worked: row.what_worked,
        what_to_change: row.what_to_change,
        cases_that_landed: row.cases_that_landed,
        arguments_that_landed: row.arguments_that_landed,
        status: row.status,
        created_by: row.created_by,
        updated_at: row.updated_at,
      },
      { onConflict: "season_id,team_id" },
    )
    .select("*")
    .single();
  if (error) throw new Error(`upsertRetro: ${error.message}`);
  return mapRetro(data as Record<string, unknown>);
}

export async function listRetroThemes(
  seasonId: string,
  teamId: string,
): Promise<RetroCommentTheme[]> {
  if (isSampleDataMode()) {
    return ((await readStore()).retro_comment_themes ?? []).filter(
      (t) => t.season_id === seasonId && t.team_id === teamId,
    );
  }
  const { data, error } = await getServiceSupabase()
    .from("retro_comment_themes")
    .select("*")
    .eq("season_id", seasonId)
    .eq("team_id", teamId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listRetroThemes: ${error.message}`);
  return ((data as Record<string, unknown>[]) ?? []).map(mapTheme);
}

export async function replaceRetroThemes(input: {
  seasonId: string;
  teamId: string;
  themes: Array<{
    theme: string;
    summary: string;
    citation_log_ids: string[];
    citation_quotes: RetroCitationQuote[];
  }>;
  createdBy: string | null;
}): Promise<RetroCommentTheme[]> {
  const now = nowIso();
  const rows: RetroCommentTheme[] = input.themes.map((t) => ({
    id: randomUUID(),
    season_id: input.seasonId,
    team_id: input.teamId,
    theme: t.theme,
    summary: t.summary,
    citation_log_ids: t.citation_log_ids,
    citation_quotes: t.citation_quotes,
    created_at: now,
    created_by: input.createdBy,
  }));
  if (isSampleDataMode()) {
    const s = await readStore();
    const kept = (s.retro_comment_themes ?? []).filter(
      (t) =>
        !(t.season_id === input.seasonId && t.team_id === input.teamId),
    );
    await updateStore(async (store) => {
      Object.assign(store, { retro_comment_themes: [...kept, ...rows] });
    });
    return rows;
  }
  const sb = getServiceSupabase();
  await sb
    .from("retro_comment_themes")
    .delete()
    .eq("season_id", input.seasonId)
    .eq("team_id", input.teamId);
  if (!rows.length) return [];
  const { data, error } = await sb
    .from("retro_comment_themes")
    .insert(
      rows.map((r) => ({
        id: r.id,
        season_id: r.season_id,
        team_id: r.team_id,
        theme: r.theme,
        summary: r.summary,
        citation_log_ids: r.citation_log_ids,
        citation_quotes: r.citation_quotes,
        created_by: r.created_by,
      })),
    )
    .select("*");
  if (error) throw new Error(`replaceRetroThemes: ${error.message}`);
  return ((data as Record<string, unknown>[]) ?? []).map(mapTheme);
}

export async function listNationalsChecklist(
  seasonId: string,
  teamId: string,
): Promise<NationalsChecklistItem[]> {
  if (isSampleDataMode()) {
    return ((await readStore()).nationals_checklist_items ?? [])
      .filter((i) => i.season_id === seasonId && i.team_id === teamId)
      .sort((a, b) => a.sort_order - b.sort_order);
  }
  const { data, error } = await getServiceSupabase()
    .from("nationals_checklist_items")
    .select("*")
    .eq("season_id", seasonId)
    .eq("team_id", teamId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`listNationalsChecklist: ${error.message}`);
  return ((data as Record<string, unknown>[]) ?? []).map(mapChecklist);
}

export async function seedNationalsChecklist(input: {
  seasonId: string;
  teamId: string;
  items: Array<{ label: string; detail: string }>;
}): Promise<NationalsChecklistItem[]> {
  const existing = await listNationalsChecklist(input.seasonId, input.teamId);
  if (existing.length) return existing;
  const now = nowIso();
  const rows: NationalsChecklistItem[] = input.items.map((it, i) => ({
    id: randomUUID(),
    season_id: input.seasonId,
    team_id: input.teamId,
    label: it.label,
    detail: it.detail,
    done: false,
    sort_order: i,
    created_at: now,
    updated_at: now,
  }));
  if (isSampleDataMode()) {
    const s = await readStore();
    await updateStore(async (store) => { Object.assign(store, {
      nationals_checklist_items: [
        ...(s.nationals_checklist_items ?? []),
        ...rows,
      ],
    });
    });
    return rows;
  }
  const { data, error } = await getServiceSupabase()
    .from("nationals_checklist_items")
    .insert(
      rows.map((r) => ({
        id: r.id,
        season_id: r.season_id,
        team_id: r.team_id,
        label: r.label,
        detail: r.detail,
        done: false,
        sort_order: r.sort_order,
      })),
    )
    .select("*");
  if (error) throw new Error(`seedNationalsChecklist: ${error.message}`);
  return ((data as Record<string, unknown>[]) ?? []).map(mapChecklist);
}

export async function updateNationalsChecklistItem(input: {
  id: string;
  done: boolean;
}): Promise<NationalsChecklistItem> {
  const updated_at = nowIso();
  if (isSampleDataMode()) {
    const s = await readStore();
    const list = (s.nationals_checklist_items ?? []).map((i) =>
      i.id === input.id ? { ...i, done: input.done, updated_at } : i,
    );
    await updateStore(async (store) => {
      Object.assign(store, { nationals_checklist_items: list });
    });
    const found = list.find((i) => i.id === input.id);
    if (!found) throw new Error("checklist item not found");
    return found;
  }
  const { data, error } = await getServiceSupabase()
    .from("nationals_checklist_items")
    .update({ done: input.done, updated_at })
    .eq("id", input.id)
    .select("*")
    .single();
  if (error) throw new Error(`updateNationalsChecklistItem: ${error.message}`);
  return mapChecklist(data as Record<string, unknown>);
}

export async function getHandoff(
  seasonId: string,
): Promise<SeasonHandoff | null> {
  if (isSampleDataMode()) {
    return (
      (await readStore()).season_handoffs?.find(
        (h) => h.season_id === seasonId,
      ) ?? null
    );
  }
  const { data, error } = await getServiceSupabase()
    .from("season_handoffs")
    .select("*")
    .eq("season_id", seasonId)
    .maybeSingle();
  if (error) throw new Error(`getHandoff: ${error.message}`);
  return data ? mapHandoff(data as Record<string, unknown>) : null;
}

export async function upsertHandoff(input: {
  seasonId: string;
  body: string;
  who_did_what: HandoffWhoDidWhat[];
  updatedBy: string | null;
}): Promise<SeasonHandoff> {
  const row: SeasonHandoff = {
    id: randomUUID(),
    season_id: input.seasonId,
    body: input.body,
    who_did_what: input.who_did_what,
    updated_at: nowIso(),
    updated_by: input.updatedBy,
  };
  if (isSampleDataMode()) {
    const s = await readStore();
    const list = [...(s.season_handoffs ?? [])];
    const i = list.findIndex((h) => h.season_id === input.seasonId);
    if (i >= 0) {
      row.id = list[i]!.id;
      list[i] = row;
    } else list.push(row);
    await updateStore(async (store) => {
      Object.assign(store, { season_handoffs: list });
    });
    return row;
  }
  const { data, error } = await getServiceSupabase()
    .from("season_handoffs")
    .upsert(
      {
        season_id: row.season_id,
        body: row.body,
        who_did_what: row.who_did_what,
        updated_at: row.updated_at,
        updated_by: row.updated_by,
      },
      { onConflict: "season_id" },
    )
    .select("*")
    .single();
  if (error) throw new Error(`upsertHandoff: ${error.message}`);
  return mapHandoff(data as Record<string, unknown>);
}
