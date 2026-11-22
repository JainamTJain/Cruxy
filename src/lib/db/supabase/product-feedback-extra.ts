/**
 * Wave 9 G: product feedback (report a problem / suggest something).
 */
import "server-only";

import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { assertOk, getServiceSupabase } from "@/lib/db/supabase/client";
import { createNotification } from "@/lib/db/supabase/auth-extra";
import { logActivity } from "@/lib/db/repository";
import { nowIso } from "@/lib/utils";

export type ProductFeedbackKind = "problem" | "suggestion";
export type ProductFeedbackStatus =
  | "open"
  | "fixed"
  | "wont_fix"
  | "duplicate";

export type ProductFeedback = {
  id: string;
  person_id: string;
  kind: ProductFeedbackKind;
  page_path: string;
  what_doing: string;
  details: string | null;
  screenshot_path: string | null;
  status: ProductFeedbackStatus;
  admin_note: string | null;
  fixed_at: string | null;
  created_at: string;
  updated_at: string;
};

type SampleBag = { product_feedback?: ProductFeedback[] };

export async function createProductFeedback(input: {
  personId: string;
  kind: ProductFeedbackKind;
  pagePath: string;
  whatDoing: string;
  details?: string | null;
  screenshotPath?: string | null;
}): Promise<ProductFeedback> {
  const now = nowIso();
  const row: ProductFeedback = {
    id: randomUUID(),
    person_id: input.personId,
    kind: input.kind,
    page_path: input.pagePath.slice(0, 500),
    what_doing: input.whatDoing.slice(0, 2000),
    details: input.details?.slice(0, 4000) ?? null,
    screenshot_path: input.screenshotPath ?? null,
    status: "open",
    admin_note: null,
    fixed_at: null,
    created_at: now,
    updated_at: now,
  };

  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = s as unknown as SampleBag;
      if (!bag.product_feedback) bag.product_feedback = [];
      bag.product_feedback.unshift(row);
    });
  } else {
    const { error } = await getServiceSupabase()
      .from("product_feedback")
      .insert(row);
    assertOk(error, "createProductFeedback");
  }

  await logActivity({
    person_id: input.personId,
    action: "product_feedback_created",
    target: row.id,
    meta: { kind: row.kind, page_path: row.page_path },
  });

  return row;
}

export async function listProductFeedback(opts?: {
  status?: ProductFeedbackStatus;
}): Promise<ProductFeedback[]> {
  if (isSampleDataMode()) {
    const store = (await readStore()) as unknown as SampleBag;
    let rows = store.product_feedback ?? [];
    if (opts?.status) rows = rows.filter((r) => r.status === opts.status);
    return [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }
  const sb = getServiceSupabase();
  let q = sb
    .from("product_feedback")
    .select("*")
    .order("created_at", { ascending: false });
  if (opts?.status) q = q.eq("status", opts.status);
  const { data, error } = await q;
  assertOk(error, "listProductFeedback");
  return (data as ProductFeedback[]) ?? [];
}

export async function updateProductFeedbackStatus(input: {
  id: string;
  status: ProductFeedbackStatus;
  adminNote?: string | null;
  actorId: string;
}): Promise<ProductFeedback | null> {
  const now = nowIso();
  let updated: ProductFeedback | null = null;

  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = s as unknown as SampleBag;
      const row = (bag.product_feedback ?? []).find((r) => r.id === input.id);
      if (!row) return;
      row.status = input.status;
      row.updated_at = now;
      if (input.adminNote !== undefined) row.admin_note = input.adminNote;
      if (input.status === "fixed") row.fixed_at = now;
      updated = { ...row };
    });
  } else {
    const patch: Record<string, unknown> = {
      status: input.status,
      updated_at: now,
    };
    if (input.adminNote !== undefined) patch.admin_note = input.adminNote;
    if (input.status === "fixed") patch.fixed_at = now;
    const { data, error } = await getServiceSupabase()
      .from("product_feedback")
      .update(patch)
      .eq("id", input.id)
      .select("*")
      .single();
    assertOk(error, "updateProductFeedbackStatus");
    updated = data as ProductFeedback;
  }

  if (!updated) return null;

  await logActivity({
    person_id: input.actorId,
    action: "product_feedback_updated",
    target: updated.id,
    meta: { status: updated.status },
  });

  if (input.status === "fixed") {
    await createNotification({
      personId: updated.person_id,
      kind: "product_feedback_fixed",
      title: "Your report is fixed",
      body:
        updated.kind === "suggestion"
          ? "Thanks for the suggestion. Jainam marked it done."
          : "Thanks for the report. Jainam marked it fixed.",
      href: "/help/whats-new",
      createdBy: input.actorId,
      payload: { feedback_id: updated.id },
    });
  }

  return updated;
}
