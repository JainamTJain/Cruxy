import "server-only";
import { createHash } from "crypto";
import { LOCKOUT_MINUTES, MAX_FAILED_ATTEMPTS } from "@/lib/constants";
import { isSampleDataMode } from "@/lib/db/config";
import { logActivity } from "@/lib/db/repository";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import { addMinutes, isLocked, nowIso } from "@/lib/utils";

export type PortalKind = "judging" | "session_code";

export type PortalCheckResult =
  | { ok: true }
  | { ok: false; reason: string; lockedUntil?: string };

type MemoryRow = {
  portal: PortalKind;
  ip_hash: string;
  target: string | null;
  failures: number;
  locked_until: string | null;
};

const memory = new Map<string, MemoryRow>();

function memKey(portal: PortalKind, ipHash: string) {
  return `${portal}:${ipHash}`;
}

/** Hash a caller key (IP / device). Never store the raw value. */
export function hashCallerKey(raw: string | null | undefined): string {
  return createHash("sha256")
    .update((raw ?? "unknown").trim() || "unknown")
    .digest("hex");
}

/**
 * Server helper for D (and judging routes): check whether a portal is locked
 * for this caller before verifying a session / judging code.
 */
export async function checkPortalLock(opts: {
  portal: PortalKind;
  ipKey: string | null | undefined;
}): Promise<PortalCheckResult> {
  const ipHash = hashCallerKey(opts.ipKey);

  if (isSampleDataMode()) {
    const row = memory.get(memKey(opts.portal, ipHash));
    if (row && isLocked(row.locked_until)) {
      return {
        ok: false,
        reason: "Too many wrong tries. Try again in a few minutes.",
        lockedUntil: row.locked_until ?? undefined,
      };
    }
    return { ok: true };
  }

  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("portal_attempts")
    .select("failures, locked_until")
    .eq("portal", opts.portal)
    .eq("ip_hash", ipHash)
    .maybeSingle();
  if (error) throw new Error(`checkPortalLock: ${error.message}`);
  if (data?.locked_until && isLocked(data.locked_until as string)) {
    return {
      ok: false,
      reason: "Too many wrong tries. Try again in a few minutes.",
      lockedUntil: data.locked_until as string,
    };
  }
  return { ok: true };
}

/**
 * Record a failed session-code or judging-portal attempt.
 * Locks after MAX_FAILED_ATTEMPTS and always writes activity_log.
 */
export async function recordPortalFailure(opts: {
  portal: PortalKind;
  ipKey: string | null | undefined;
  target?: string | null;
  personId?: string | null;
}): Promise<{ ok: false; reason: string; lockedUntil?: string }> {
  const ipHash = hashCallerKey(opts.ipKey);
  const target = opts.target?.slice(0, 32) ?? null;

  if (isSampleDataMode()) {
    const key = memKey(opts.portal, ipHash);
    let row = memory.get(key);
    if (!row) {
      row = {
        portal: opts.portal,
        ip_hash: ipHash,
        target,
        failures: 0,
        locked_until: null,
      };
      memory.set(key, row);
    }
    row.failures += 1;
    row.target = target;
    if (row.failures >= MAX_FAILED_ATTEMPTS) {
      row.locked_until = addMinutes(new Date(), LOCKOUT_MINUTES).toISOString();
      row.failures = 0;
      await logActivity({
        person_id: opts.personId ?? null,
        action: `${opts.portal}_locked`,
        target,
        meta: { minutes: LOCKOUT_MINUTES },
        ip_hash: ipHash,
      });
      return {
        ok: false,
        reason: "Too many wrong tries. Locked for 10 minutes.",
        lockedUntil: row.locked_until,
      };
    }
    await logActivity({
      person_id: opts.personId ?? null,
      action: `${opts.portal}_failed`,
      target,
      ip_hash: ipHash,
    });
    return { ok: false, reason: "Wrong code." };
  }

  const sb = getServiceSupabase();
  const existing = await sb
    .from("portal_attempts")
    .select("id, failures, locked_until")
    .eq("portal", opts.portal)
    .eq("ip_hash", ipHash)
    .maybeSingle();
  if (existing.error) {
    throw new Error(`recordPortalFailure.read: ${existing.error.message}`);
  }

  let failures = ((existing.data?.failures as number) ?? 0) + 1;
  let lockedUntil: string | null = null;
  if (failures >= MAX_FAILED_ATTEMPTS) {
    lockedUntil = addMinutes(new Date(), LOCKOUT_MINUTES).toISOString();
    failures = 0;
  }

  const payload = {
    portal: opts.portal,
    ip_hash: ipHash,
    target,
    failures,
    locked_until: lockedUntil,
    last_attempt_at: nowIso(),
  };

  if (existing.data?.id) {
    const { error } = await sb
      .from("portal_attempts")
      .update(payload)
      .eq("id", existing.data.id);
    if (error) throw new Error(`recordPortalFailure.update: ${error.message}`);
  } else {
    const { error } = await sb.from("portal_attempts").insert(payload);
    if (error) throw new Error(`recordPortalFailure.insert: ${error.message}`);
  }

  if (lockedUntil) {
    await logActivity({
      person_id: opts.personId ?? null,
      action: `${opts.portal}_locked`,
      target,
      meta: { minutes: LOCKOUT_MINUTES },
      ip_hash: ipHash,
    });
    return {
      ok: false,
      reason: "Too many wrong tries. Locked for 10 minutes.",
      lockedUntil,
    };
  }

  await logActivity({
    person_id: opts.personId ?? null,
    action: `${opts.portal}_failed`,
    target,
    ip_hash: ipHash,
  });
  return { ok: false, reason: "Wrong code." };
}

/** Clear attempts after a successful join / judging entry. */
export async function clearPortalAttempts(opts: {
  portal: PortalKind;
  ipKey: string | null | undefined;
}): Promise<void> {
  const ipHash = hashCallerKey(opts.ipKey);
  if (isSampleDataMode()) {
    memory.delete(memKey(opts.portal, ipHash));
    return;
  }
  const sb = getServiceSupabase();
  const { error } = await sb
    .from("portal_attempts")
    .delete()
    .eq("portal", opts.portal)
    .eq("ip_hash", ipHash);
  if (error) throw new Error(`clearPortalAttempts: ${error.message}`);
}

/**
 * Wrap a session-code or judging-code check with lock + failure logging.
 * Call sites in D: check lock → verify code → clear on success / record on fail.
 */
export async function withPortalBruteForce<T>(opts: {
  portal: PortalKind;
  ipKey: string | null | undefined;
  personId?: string | null;
  targetLabel?: string | null;
  verify: () => Promise<{ ok: true; value: T } | { ok: false }>;
}): Promise<
  | { ok: true; value: T }
  | { ok: false; reason: string; lockedUntil?: string }
> {
  const locked = await checkPortalLock({
    portal: opts.portal,
    ipKey: opts.ipKey,
  });
  if (!locked.ok) {
    return {
      ok: false,
      reason: locked.reason,
      lockedUntil: locked.lockedUntil,
    };
  }

  const result = await opts.verify();
  if (result.ok) {
    await clearPortalAttempts({ portal: opts.portal, ipKey: opts.ipKey });
    return result;
  }
  return recordPortalFailure({
    portal: opts.portal,
    ipKey: opts.ipKey,
    target: opts.targetLabel,
    personId: opts.personId,
  });
}
