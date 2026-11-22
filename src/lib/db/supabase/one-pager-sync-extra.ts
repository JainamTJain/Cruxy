/**
 * One-pager sync proposals from the working document (migration 00072).
 */
import "server-only";
import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import type { OnePagerBody } from "@/lib/revision/types";

export type OnePagerSyncProposalRow = {
  id: string;
  team_id: string;
  case_id: string;
  proposed_body: OnePagerBody;
  change_summary: string;
  status: "pending" | "accepted" | "dismissed";
  created_at: string;
  created_by: string | null;
  decided_at: string | null;
  decided_by: string | null;
};

const sample: OnePagerSyncProposalRow[] = [];

function nowIso() {
  return new Date().toISOString();
}

export async function insertOnePagerSyncProposal(opts: {
  teamId: string;
  caseId: string;
  body: OnePagerBody;
  changeSummary: string;
  personId: string | null;
}): Promise<OnePagerSyncProposalRow> {
  // Replace any prior pending proposal for this team+case.
  if (isSampleDataMode()) {
    for (const row of sample) {
      if (
        row.team_id === opts.teamId &&
        row.case_id === opts.caseId &&
        row.status === "pending"
      ) {
        row.status = "dismissed";
        row.decided_at = nowIso();
      }
    }
    const created: OnePagerSyncProposalRow = {
      id: randomUUID(),
      team_id: opts.teamId,
      case_id: opts.caseId,
      proposed_body: opts.body,
      change_summary: opts.changeSummary.replace(/[·—–]/g, ","),
      status: "pending",
      created_at: nowIso(),
      created_by: opts.personId,
      decided_at: null,
      decided_by: null,
    };
    sample.push(created);
    return created;
  }

  const sb = getServiceSupabase();
  await sb
    .from("one_pager_sync_proposals")
    .update({ status: "dismissed", decided_at: nowIso() })
    .eq("team_id", opts.teamId)
    .eq("case_id", opts.caseId)
    .eq("status", "pending");

  const { data, error } = await sb
    .from("one_pager_sync_proposals")
    .insert({
      team_id: opts.teamId,
      case_id: opts.caseId,
      proposed_body: opts.body,
      change_summary: opts.changeSummary.replace(/[·—–]/g, ","),
      status: "pending",
      created_by: opts.personId,
    })
    .select("*")
    .single();
  if (error) throw new Error(`insertOnePagerSyncProposal: ${error.message}`);
  return data as OnePagerSyncProposalRow;
}

export async function getPendingOnePagerSync(opts: {
  teamId: string;
  caseId: string;
}): Promise<OnePagerSyncProposalRow | null> {
  if (isSampleDataMode()) {
    return (
      sample
        .filter(
          (r) =>
            r.team_id === opts.teamId &&
            r.case_id === opts.caseId &&
            r.status === "pending",
        )
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
    );
  }
  const { data, error } = await getServiceSupabase()
    .from("one_pager_sync_proposals")
    .select("*")
    .eq("team_id", opts.teamId)
    .eq("case_id", opts.caseId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getPendingOnePagerSync: ${error.message}`);
  return (data as OnePagerSyncProposalRow) ?? null;
}

export async function decideOnePagerSync(opts: {
  id: string;
  status: "accepted" | "dismissed";
  personId: string;
}): Promise<OnePagerSyncProposalRow | null> {
  if (isSampleDataMode()) {
    const i = sample.findIndex((r) => r.id === opts.id);
    if (i < 0) return null;
    sample[i] = {
      ...sample[i]!,
      status: opts.status,
      decided_at: nowIso(),
      decided_by: opts.personId,
    };
    return sample[i]!;
  }
  const { data, error } = await getServiceSupabase()
    .from("one_pager_sync_proposals")
    .update({
      status: opts.status,
      decided_at: nowIso(),
      decided_by: opts.personId,
    })
    .eq("id", opts.id)
    .select("*")
    .single();
  if (error) throw new Error(`decideOnePagerSync: ${error.message}`);
  return data as OnePagerSyncProposalRow;
}
