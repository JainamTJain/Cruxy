import "server-only";

import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { logActivity } from "@/lib/db/repository";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import { nowIso } from "@/lib/utils";

export type ExtraReadingKind =
  | "import"
  | "fact"
  | "quote"
  | "example"
  | "framework"
  | "material";

export type ExtraReadingItem = {
  id: string;
  team_id: string;
  case_id: string;
  title: string;
  body: string;
  kind: ExtraReadingKind;
  drive_file_id: string | null;
  shared: boolean;
  created_by: string | null;
  created_at: string;
  /** Own team import, opted-in shared, or Evidence Library truth item. */
  origin: "own" | "shared" | "truth";
  team_name?: string | null;
};

type SampleImport = {
  id: string;
  team_id: string;
  case_id: string;
  title: string;
  body: string;
  kind: ExtraReadingKind;
  drive_file_id: string | null;
  shared: boolean;
  created_by: string | null;
  created_at: string;
};

type SampleOptIn = {
  id: string;
  team_id: string;
  import_id: string;
  opted_in_by: string | null;
  created_at: string;
};

type SampleStoreExtra = Awaited<ReturnType<typeof readStore>> & {
  case_reading_imports: SampleImport[];
  case_reading_opt_ins: SampleOptIn[];
};

function sampleBucket(
  store: Awaited<ReturnType<typeof readStore>>,
): SampleStoreExtra {
  const s = store as SampleStoreExtra;
  if (!s.case_reading_imports) s.case_reading_imports = [];
  if (!s.case_reading_opt_ins) s.case_reading_opt_ins = [];
  return s;
}

export async function listExtraReading(input: {
  caseId: string;
  teamId: string;
}): Promise<{
  items: ExtraReadingItem[];
  available_shared: ExtraReadingItem[];
}> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const s = sampleBucket(store);
    const teams = new Map(store.teams.map((t) => [t.id, t.name]));
    const own = s.case_reading_imports
      .filter((r) => r.case_id === input.caseId && r.team_id === input.teamId)
      .map((r) => ({
        ...r,
        origin: "own" as const,
        team_name: teams.get(r.team_id) ?? null,
      }));
    const opted = new Set(
      s.case_reading_opt_ins
        .filter((o) => o.team_id === input.teamId)
        .map((o) => o.import_id),
    );
    const sharedShown = s.case_reading_imports
      .filter(
        (r) =>
          r.case_id === input.caseId &&
          r.shared &&
          r.team_id !== input.teamId &&
          opted.has(r.id),
      )
      .map((r) => ({
        ...r,
        origin: "shared" as const,
        team_name: teams.get(r.team_id) ?? null,
      }));
    const available = s.case_reading_imports
      .filter(
        (r) =>
          r.case_id === input.caseId &&
          r.shared &&
          r.team_id !== input.teamId &&
          !opted.has(r.id),
      )
      .map((r) => ({
        ...r,
        origin: "shared" as const,
        team_name: teams.get(r.team_id) ?? null,
      }));
    return { items: [...own, ...sharedShown], available_shared: available };
  }

  const sb = getServiceSupabase();
  const { data: ownRows } = await sb
    .from("case_reading_imports")
    .select("*")
    .eq("case_id", input.caseId)
    .eq("team_id", input.teamId)
    .order("created_at", { ascending: false });
  const { data: optIns } = await sb
    .from("case_reading_opt_ins")
    .select("import_id")
    .eq("team_id", input.teamId);
  const opted = new Set((optIns ?? []).map((o) => o.import_id as string));
  const { data: sharedRows } = await sb
    .from("case_reading_imports")
    .select("*, teams(name)")
    .eq("case_id", input.caseId)
    .eq("shared", true)
    .neq("team_id", input.teamId);

  const items: ExtraReadingItem[] = [];
  for (const r of ownRows ?? []) {
    items.push({
      id: r.id,
      team_id: r.team_id,
      case_id: r.case_id,
      title: r.title,
      body: r.body ?? "",
      kind: r.kind as ExtraReadingKind,
      drive_file_id: r.drive_file_id ?? null,
      shared: Boolean(r.shared),
      created_by: r.created_by ?? null,
      created_at: r.created_at,
      origin: "own",
      team_name: null,
    });
  }
  const available_shared: ExtraReadingItem[] = [];
  for (const r of sharedRows ?? []) {
    const teamName =
      (r.teams as { name?: string } | null)?.name ?? null;
    const row: ExtraReadingItem = {
      id: r.id,
      team_id: r.team_id,
      case_id: r.case_id,
      title: r.title,
      body: r.body ?? "",
      kind: r.kind as ExtraReadingKind,
      drive_file_id: r.drive_file_id ?? null,
      shared: true,
      created_by: r.created_by ?? null,
      created_at: r.created_at,
      origin: "shared",
      team_name: teamName,
    };
    if (opted.has(r.id)) items.push(row);
    else available_shared.push(row);
  }
  return { items, available_shared };
}

export async function addExtraReading(input: {
  caseId: string;
  teamId: string;
  personId: string;
  title: string;
  body: string;
  kind?: ExtraReadingKind;
}): Promise<ExtraReadingItem> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw new Error("Add a short title.");
  const kind = input.kind ?? "import";
  const now = nowIso();

  if (isSampleDataMode()) {
    const row: SampleImport = {
      id: randomUUID(),
      team_id: input.teamId,
      case_id: input.caseId,
      title,
      body,
      kind,
      drive_file_id: null,
      shared: false,
      created_by: input.personId,
      created_at: now,
    };
    await updateStore((store) => {
      const s = sampleBucket(store);
      s.case_reading_imports.push(row);
    });
    await logActivity({
      person_id: input.personId,
      action: "case_reading_import_added",
      target: row.id,
      meta: { caseId: input.caseId, teamId: input.teamId },
    });
    return { ...row, origin: "own", team_name: null };
  }

  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("case_reading_imports")
    .insert({
      team_id: input.teamId,
      case_id: input.caseId,
      title,
      body,
      kind,
      shared: false,
      created_by: input.personId,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not save.");
  await logActivity({
    person_id: input.personId,
    action: "case_reading_import_added",
    target: data.id,
    meta: { caseId: input.caseId, teamId: input.teamId },
  });
  return {
    id: data.id,
    team_id: data.team_id,
    case_id: data.case_id,
    title: data.title,
    body: data.body ?? "",
    kind: data.kind as ExtraReadingKind,
    drive_file_id: data.drive_file_id ?? null,
    shared: Boolean(data.shared),
    created_by: data.created_by ?? null,
    created_at: data.created_at,
    origin: "own",
    team_name: null,
  };
}

export async function setExtraReadingShared(input: {
  importId: string;
  teamId: string;
  personId: string;
  shared: boolean;
}): Promise<void> {
  if (isSampleDataMode()) {
    await updateStore((store) => {
      const s = sampleBucket(store);
      const row = s.case_reading_imports.find(
        (r) => r.id === input.importId && r.team_id === input.teamId,
      );
      if (row) row.shared = input.shared;
    });
  } else {
    const sb = getServiceSupabase();
    const { error } = await sb
      .from("case_reading_imports")
      .update({ shared: input.shared, updated_at: nowIso() })
      .eq("id", input.importId)
      .eq("team_id", input.teamId);
    if (error) throw new Error(error.message);
  }
  await logActivity({
    person_id: input.personId,
    action: input.shared
      ? "case_reading_shared"
      : "case_reading_unshared",
    target: input.importId,
    meta: { teamId: input.teamId },
  });
}

export async function optInExtraReading(input: {
  importId: string;
  teamId: string;
  personId: string;
}): Promise<void> {
  if (isSampleDataMode()) {
    await updateStore((store) => {
      const s = sampleBucket(store);
      const exists = s.case_reading_opt_ins.some(
        (o) => o.team_id === input.teamId && o.import_id === input.importId,
      );
      if (exists) return;
      s.case_reading_opt_ins.push({
        id: randomUUID(),
        team_id: input.teamId,
        import_id: input.importId,
        opted_in_by: input.personId,
        created_at: nowIso(),
      });
    });
  } else {
    const sb = getServiceSupabase();
    const { error } = await sb.from("case_reading_opt_ins").upsert(
      {
        team_id: input.teamId,
        import_id: input.importId,
        opted_in_by: input.personId,
      },
      { onConflict: "team_id,import_id" },
    );
    if (error) throw new Error(error.message);
  }
  await logActivity({
    person_id: input.personId,
    action: "case_reading_opt_in",
    target: input.importId,
    meta: { teamId: input.teamId },
  });
}
