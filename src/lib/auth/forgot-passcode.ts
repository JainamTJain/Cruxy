/**
 * Wave 9 K: forgot passcode with coach / tech-admin approval.
 * Never reveals the old passcode. Rate-limited. Logged.
 */
import "server-only";
import { randomUUID } from "crypto";
import { setPersonalPasscode } from "@/lib/auth/passcode-rules";
import {
  getPersonById,
  listPeopleFull,
  logActivity,
  replacePersonalCode,
} from "@/lib/db/repository";
import { isSampleDataMode } from "@/lib/db/config";
import { createNotification } from "@/lib/db/supabase/auth-extra";
import { bumpSessionVersion } from "@/lib/db/supabase/auth-extra";
import { assertOk, getServiceSupabase } from "@/lib/db/supabase/client";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { nowIso } from "@/lib/utils";
import { hashPasscode } from "@/lib/crypto/passcodes";

export type ResetRequestStatus =
  | "pending"
  | "approved"
  | "completed"
  | "denied"
  | "expired";

export type PasscodeResetRequest = {
  id: string;
  person_id: string;
  status: ResetRequestStatus;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
  completed_at: string | null;
  expires_at: string;
  ip_hash: string | null;
};

const APPROVED_HOURS = 2;
const PENDING_HOURS = 24;
const MAX_REQUESTS_PER_DAY = 3;

type SampleBag = { passcode_reset_requests?: PasscodeResetRequest[] };

function sampleBag(s: unknown): PasscodeResetRequest[] {
  const bag = s as SampleBag;
  if (!bag.passcode_reset_requests) bag.passcode_reset_requests = [];
  return bag.passcode_reset_requests;
}

function mapRow(r: Record<string, unknown>): PasscodeResetRequest {
  return {
    id: String(r.id),
    person_id: String(r.person_id),
    status: r.status as ResetRequestStatus,
    created_at: String(r.created_at),
    approved_at: (r.approved_at as string | null) ?? null,
    approved_by: (r.approved_by as string | null) ?? null,
    completed_at: (r.completed_at as string | null) ?? null,
    expires_at: String(r.expires_at),
    ip_hash: (r.ip_hash as string | null) ?? null,
  };
}

async function listForPerson(personId: string): Promise<PasscodeResetRequest[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return sampleBag(store)
      .filter((r) => r.person_id === personId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  const { data, error } = await getServiceSupabase()
    .from("passcode_reset_requests")
    .select("*")
    .eq("person_id", personId)
    .order("created_at", { ascending: false })
    .limit(20);
  assertOk(error, "listPasscodeResetRequests");
  return ((data ?? []) as Record<string, unknown>[]).map(mapRow);
}

async function getById(id: string): Promise<PasscodeResetRequest | null> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return sampleBag(store).find((r) => r.id === id) ?? null;
  }
  const { data, error } = await getServiceSupabase()
    .from("passcode_reset_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  assertOk(error, "getPasscodeResetRequest");
  return data ? mapRow(data as Record<string, unknown>) : null;
}

function isExpired(row: PasscodeResetRequest, now = Date.now()): boolean {
  return new Date(row.expires_at).getTime() < now;
}

export async function getForgotPasscodeStatus(personId: string): Promise<{
  status: ResetRequestStatus | "none";
  requestId: string | null;
  message: string;
}> {
  const rows = await listForPerson(personId);
  const open = rows.find(
    (r) =>
      (r.status === "pending" || r.status === "approved") && !isExpired(r),
  );
  if (!open) {
    return {
      status: "none",
      requestId: null,
      message: "Forgot your passcode? Ask Dr. B or Jainam to approve a reset.",
    };
  }
  if (open.status === "pending") {
    return {
      status: "pending",
      requestId: open.id,
      message:
        "Reset requested. Dr. B or Jainam will approve it. Then you can set a new passcode here.",
    };
  }
  return {
    status: "approved",
    requestId: open.id,
    message: "Reset approved. Set a new six-digit passcode below.",
  };
}

export async function requestForgotPasscode(opts: {
  personId: string;
  ipHash: string | null;
}): Promise<{ ok: true; requestId: string } | { ok: false; error: string }> {
  const person = await getPersonById(opts.personId);
  if (!person) return { ok: false, error: "Name not found." };

  const rows = await listForPerson(opts.personId);
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recent = rows.filter(
    (r) => new Date(r.created_at).getTime() >= dayAgo,
  );
  if (recent.length >= MAX_REQUESTS_PER_DAY) {
    return {
      ok: false,
      error: "Too many reset requests today. Try again tomorrow, or ask Dr. B.",
    };
  }
  const pending = rows.find(
    (r) => r.status === "pending" && !isExpired(r),
  );
  if (pending) {
    return { ok: true, requestId: pending.id };
  }
  const approved = rows.find(
    (r) => r.status === "approved" && !isExpired(r),
  );
  if (approved) {
    return { ok: true, requestId: approved.id };
  }

  const now = nowIso();
  const expires = new Date(
    Date.now() + PENDING_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const row: PasscodeResetRequest = {
    id: randomUUID(),
    person_id: opts.personId,
    status: "pending",
    created_at: now,
    approved_at: null,
    approved_by: null,
    completed_at: null,
    expires_at: expires,
    ip_hash: opts.ipHash,
  };

  if (isSampleDataMode()) {
    await updateStore((s) => {
      sampleBag(s).push(row);
    });
  } else {
    const { error } = await getServiceSupabase()
      .from("passcode_reset_requests")
      .insert({
        id: row.id,
        person_id: row.person_id,
        status: row.status,
        created_at: row.created_at,
        expires_at: row.expires_at,
        ip_hash: row.ip_hash,
      });
    assertOk(error, "requestForgotPasscode.insert");
  }

  await logActivity({
    person_id: opts.personId,
    action: "passcode_reset_requested",
    target: row.id,
    ip_hash: opts.ipHash,
    meta: { name: person.name },
  });

  const people = await listPeopleFull();
  const admins = people.filter(
    (p) => p.role === "tech_admin" || p.role === "coach_admin",
  );
  for (const admin of admins) {
    await createNotification({
      personId: admin.id,
      kind: "passcode_reset_request",
      title: `${person.name} forgot their passcode`,
      body: "One tap approves a reset. They set a new passcode. The old one is never shown.",
      href: `/coach/approve-reset?requestId=${row.id}`,
      createdBy: opts.personId,
      payload: {
        requestId: row.id,
        personId: opts.personId,
        personName: person.name,
      },
    });
  }

  return { ok: true, requestId: row.id };
}

export async function approveForgotPasscode(opts: {
  requestId: string;
  actorId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getPersonById(opts.actorId);
  if (
    !actor ||
    (actor.role !== "tech_admin" && actor.role !== "coach_admin")
  ) {
    return { ok: false, error: "Only Dr. B or Jainam can approve a reset." };
  }

  const row = await getById(opts.requestId);
  if (!row) return { ok: false, error: "Request not found." };
  if (row.status === "approved" && !isExpired(row)) return { ok: true };
  if (row.status !== "pending") {
    return { ok: false, error: "This request is no longer waiting." };
  }
  if (isExpired(row)) {
    return { ok: false, error: "This request expired. Ask them to request again." };
  }

  const approvedAt = nowIso();
  const expiresAt = new Date(
    Date.now() + APPROVED_HOURS * 60 * 60 * 1000,
  ).toISOString();

  if (isSampleDataMode()) {
    await updateStore((s) => {
      const r = sampleBag(s).find((x) => x.id === row.id);
      if (r) {
        r.status = "approved";
        r.approved_at = approvedAt;
        r.approved_by = opts.actorId;
        r.expires_at = expiresAt;
      }
    });
  } else {
    const { error } = await getServiceSupabase()
      .from("passcode_reset_requests")
      .update({
        status: "approved",
        approved_at: approvedAt,
        approved_by: opts.actorId,
        expires_at: expiresAt,
      })
      .eq("id", row.id)
      .eq("status", "pending");
    assertOk(error, "approveForgotPasscode");
  }

  // Invalidate every signed-in browser; do not reveal or reuse the old code.
  const placeholder = await hashPasscode(`reset-${row.id}-${randomUUID()}`);
  await replacePersonalCode(row.person_id, {
    kind: "personal",
    person_id: row.person_id,
    hash: placeholder,
    encrypted_copy: null,
    must_choose: true,
    set_at: nowIso(),
    last_revealed_at: null,
  });
  await bumpSessionVersion(row.person_id);

  await logActivity({
    person_id: opts.actorId,
    action: "passcode_reset_approved",
    target: row.person_id,
    meta: { requestId: row.id },
  });

  const person = await getPersonById(row.person_id);
  await createNotification({
    personId: row.person_id,
    kind: "passcode_reset_approved",
    title: "Passcode reset approved",
    body: "Go to sign in, tap your name, and set a new six-digit passcode. You have two hours.",
    href: "/sign-in",
    createdBy: opts.actorId,
    payload: { requestId: row.id },
  });

  return { ok: true, ...(person ? {} : {}) };
}

export async function completeForgotPasscode(opts: {
  personId: string;
  code: string;
  confirm: string;
  ipHash: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = await listForPerson(opts.personId);
  const approved = rows.find(
    (r) => r.status === "approved" && !isExpired(r),
  );
  if (!approved) {
    return {
      ok: false,
      error: "No approved reset waiting. Request one, or ask Dr. B.",
    };
  }

  const set = await setPersonalPasscode(
    opts.personId,
    opts.code,
    opts.confirm,
  );
  if (!set.ok) return set;

  const completedAt = nowIso();
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const r = sampleBag(s).find((x) => x.id === approved.id);
      if (r) {
        r.status = "completed";
        r.completed_at = completedAt;
      }
    });
  } else {
    const { error } = await getServiceSupabase()
      .from("passcode_reset_requests")
      .update({ status: "completed", completed_at: completedAt })
      .eq("id", approved.id);
    assertOk(error, "completeForgotPasscode");
  }

  await bumpSessionVersion(opts.personId);
  await logActivity({
    person_id: opts.personId,
    action: "passcode_reset_completed",
    target: approved.id,
    ip_hash: opts.ipHash,
  });

  return { ok: true };
}
