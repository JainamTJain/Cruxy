/**
 * Wave 7 H: material requests for paywalled / book sources Jainam should fetch.
 */
import "server-only";

import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { assertOk, getServiceSupabase } from "@/lib/db/supabase/client";
import { createNotification } from "@/lib/db/supabase/auth-extra";
import { listPeopleFull, logActivity } from "@/lib/db/repository";
import { nowIso } from "@/lib/utils";

export type MaterialRequestStatus = "open" | "fulfilled" | "dismissed";

export type MaterialRequest = {
  id: string;
  title: string;
  authors: string | null;
  year: number | null;
  doi: string | null;
  url: string | null;
  citation: string;
  why_it_matters: string;
  case_id: string | null;
  claim_ref: string | null;
  where_to_look: string | null;
  status: MaterialRequestStatus;
  matched_file_id: string | null;
  matched_drive_id: string | null;
  created_at: string;
  created_by: string | null;
  fulfilled_at: string | null;
};

type SampleBag = { material_requests?: MaterialRequest[] };

export async function saveMaterialRequest(
  row: MaterialRequest,
): Promise<MaterialRequest> {
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = s as unknown as SampleBag;
      const list = bag.material_requests ?? [];
      const i = list.findIndex((r) => r.id === row.id);
      if (i >= 0) list[i] = row;
      else list.push(row);
      bag.material_requests = list;
    });
    return row;
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("material_requests")
    .upsert(row, { onConflict: "id" })
    .select("*")
    .single();
  assertOk(error, "saveMaterialRequest");
  return data as MaterialRequest;
}

export async function listMaterialRequests(opts?: {
  status?: MaterialRequestStatus;
}): Promise<MaterialRequest[]> {
  if (isSampleDataMode()) {
    const store = (await readStore()) as unknown as SampleBag;
    let rows = store.material_requests ?? [];
    if (opts?.status) rows = rows.filter((r) => r.status === opts.status);
    return [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }
  const sb = getServiceSupabase();
  let q = sb
    .from("material_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (opts?.status) q = q.eq("status", opts.status);
  const { data, error } = await q;
  assertOk(error, "listMaterialRequests");
  return (data as MaterialRequest[]) ?? [];
}

export async function updateMaterialRequestStatus(
  id: string,
  status: MaterialRequestStatus,
  extra?: Partial<
    Pick<MaterialRequest, "matched_file_id" | "matched_drive_id" | "fulfilled_at">
  >,
): Promise<MaterialRequest | null> {
  if (isSampleDataMode()) {
    let updated: MaterialRequest | null = null;
    await updateStore((s) => {
      const bag = s as unknown as SampleBag;
      const row = (bag.material_requests ?? []).find((r) => r.id === id);
      if (row) {
        row.status = status;
        if (extra?.matched_file_id !== undefined) {
          row.matched_file_id = extra.matched_file_id;
        }
        if (extra?.matched_drive_id !== undefined) {
          row.matched_drive_id = extra.matched_drive_id;
        }
        if (extra?.fulfilled_at !== undefined) {
          row.fulfilled_at = extra.fulfilled_at;
        } else if (status === "fulfilled") {
          row.fulfilled_at = nowIso();
        }
        updated = row;
      }
    });
    return updated;
  }
  const patch: Record<string, unknown> = { status, ...extra };
  if (status === "fulfilled" && !extra?.fulfilled_at) {
    patch.fulfilled_at = nowIso();
  }
  const { data, error } = await getServiceSupabase()
    .from("material_requests")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  assertOk(error, "updateMaterialRequestStatus");
  return (data as MaterialRequest) ?? null;
}

export async function createMaterialRequest(input: {
  title: string;
  authors?: string | null;
  year?: number | null;
  doi?: string | null;
  url?: string | null;
  citation: string;
  whyItMatters: string;
  caseId?: string | null;
  claimRef?: string | null;
  whereToLook?: string | null;
  personId?: string | null;
}): Promise<MaterialRequest> {
  const open = await listMaterialRequests({ status: "open" });
  const doi = input.doi?.toLowerCase() ?? null;
  const dup = open.find(
    (r) =>
      (doi && r.doi?.toLowerCase() === doi) ||
      r.citation.toLowerCase() === input.citation.toLowerCase() ||
      (r.title.toLowerCase() === input.title.toLowerCase() &&
        r.case_id === (input.caseId ?? null)),
  );
  if (dup) return dup;

  const row: MaterialRequest = {
    id: randomUUID(),
    title: input.title.slice(0, 500),
    authors: input.authors ?? null,
    year: input.year ?? null,
    doi,
    url: input.url ?? null,
    citation: input.citation.slice(0, 1000),
    why_it_matters: input.whyItMatters.slice(0, 1000),
    case_id: input.caseId ?? null,
    claim_ref: input.claimRef ?? null,
    where_to_look:
      input.whereToLook ??
      "USC Libraries; publisher page; author page",
    status: "open",
    matched_file_id: null,
    matched_drive_id: null,
    created_at: nowIso(),
    created_by: input.personId ?? null,
    fulfilled_at: null,
  };
  await saveMaterialRequest(row);
  await logActivity({
    person_id: input.personId ?? null,
    action: "material_request_created",
    target: row.id,
    meta: { title: row.title, case_id: row.case_id, doi: row.doi },
  });

  const people = await listPeopleFull();
  const jainam =
    people.find((p) => p.role === "tech_admin") ??
    people.find((p) => /jainam/i.test(p.name));
  if (jainam) {
    await createNotification({
      personId: jainam.id,
      kind: "material_request",
      title: "Material request",
      body: `${row.title}. ${row.why_it_matters}`.slice(0, 280),
      href: "/admin/materials",
      payload: { material_request_id: row.id },
      createdBy: input.personId ?? null,
    });
  }
  return row;
}

/**
 * After Drive sync: mark open requests fulfilled when a new/changed file
 * name or path looks like the citation / title / DOI.
 */
export async function fulfillMaterialRequestsFromFiles(
  files: Array<{
    id: string;
    drive_id: string | null;
    name: string;
    path: string | null;
  }>,
): Promise<number> {
  if (!files.length) return 0;
  const open = await listMaterialRequests({ status: "open" });
  if (!open.length) return 0;
  let n = 0;
  for (const req of open) {
    const needles = [
      req.doi,
      req.title.slice(0, 40),
      ...(req.authors ? req.authors.split(/,|;/).map((s) => s.trim()).slice(0, 2) : []),
    ]
      .filter(Boolean)
      .map((s) => String(s).toLowerCase());
    const match = files.find((f) => {
      const hay = `${f.name} ${f.path ?? ""}`.toLowerCase();
      return needles.some((needle) => needle && hay.includes(needle));
    });
    if (!match) continue;
    await updateMaterialRequestStatus(req.id, "fulfilled", {
      matched_file_id: match.id,
      matched_drive_id: match.drive_id,
      fulfilled_at: nowIso(),
    });
    await logActivity({
      person_id: null,
      action: "material_request_fulfilled",
      target: req.id,
      meta: { file_id: match.id, drive_id: match.drive_id },
    });
    n += 1;
  }
  return n;
}
