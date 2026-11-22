/**
 * Wave 9 K: signed-in devices list and revoke (sign out other browsers).
 */
import "server-only";
import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { logActivity } from "@/lib/db/repository";
import { assertOk, getServiceSupabase } from "@/lib/db/supabase/client";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { nowIso } from "@/lib/utils";

export type AuthDevice = {
  id: string;
  person_id: string;
  label: string;
  user_agent: string | null;
  ip_hash: string | null;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
};

type SampleBag = { auth_devices?: AuthDevice[] };

function sampleBag(s: unknown): AuthDevice[] {
  const bag = s as SampleBag;
  if (!bag.auth_devices) bag.auth_devices = [];
  return bag.auth_devices;
}

function mapRow(r: Record<string, unknown>): AuthDevice {
  return {
    id: String(r.id),
    person_id: String(r.person_id),
    label: String(r.label ?? "Browser"),
    user_agent: (r.user_agent as string | null) ?? null,
    ip_hash: (r.ip_hash as string | null) ?? null,
    created_at: String(r.created_at),
    last_seen_at: String(r.last_seen_at),
    revoked_at: (r.revoked_at as string | null) ?? null,
  };
}

export function labelFromUserAgent(ua: string | null | undefined): string {
  if (!ua) return "Browser";
  const lower = ua.toLowerCase();
  let browser = "Browser";
  if (lower.includes("edg/")) browser = "Edge";
  else if (lower.includes("chrome/")) browser = "Chrome";
  else if (lower.includes("firefox/")) browser = "Firefox";
  else if (lower.includes("safari/") && !lower.includes("chrome/")) {
    browser = "Safari";
  }
  let os = "device";
  if (lower.includes("iphone") || lower.includes("ipad")) os = "iPhone or iPad";
  else if (lower.includes("android")) os = "Android";
  else if (lower.includes("mac os")) os = "Mac";
  else if (lower.includes("windows")) os = "Windows";
  else if (lower.includes("linux")) os = "Linux";
  return `${browser} on ${os}`;
}

export async function registerAuthDevice(opts: {
  personId: string;
  userAgent: string | null;
  ipHash: string | null;
}): Promise<AuthDevice> {
  const row: AuthDevice = {
    id: randomUUID(),
    person_id: opts.personId,
    label: labelFromUserAgent(opts.userAgent),
    user_agent: opts.userAgent,
    ip_hash: opts.ipHash,
    created_at: nowIso(),
    last_seen_at: nowIso(),
    revoked_at: null,
  };
  if (isSampleDataMode()) {
    await updateStore((s) => {
      sampleBag(s).push(row);
    });
    return row;
  }
  const { data, error } = await getServiceSupabase()
    .from("auth_devices")
    .insert({
      id: row.id,
      person_id: row.person_id,
      label: row.label,
      user_agent: row.user_agent,
      ip_hash: row.ip_hash,
      created_at: row.created_at,
      last_seen_at: row.last_seen_at,
    })
    .select("*")
    .single();
  assertOk(error, "registerAuthDevice");
  return mapRow(data as Record<string, unknown>);
}

export async function touchAuthDevice(deviceId: string): Promise<void> {
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const d = sampleBag(s).find((x) => x.id === deviceId);
      if (d && !d.revoked_at) d.last_seen_at = nowIso();
    });
    return;
  }
  await getServiceSupabase()
    .from("auth_devices")
    .update({ last_seen_at: nowIso() })
    .eq("id", deviceId)
    .is("revoked_at", null);
}

export async function isDeviceActive(
  personId: string,
  deviceId: string | undefined | null,
): Promise<boolean> {
  if (!deviceId) return true; // older cookies without device id
  if (isSampleDataMode()) {
    const store = await readStore();
    const d = sampleBag(store).find(
      (x) => x.id === deviceId && x.person_id === personId,
    );
    return Boolean(d && !d.revoked_at);
  }
  const { data, error } = await getServiceSupabase()
    .from("auth_devices")
    .select("id, revoked_at")
    .eq("id", deviceId)
    .eq("person_id", personId)
    .maybeSingle();
  assertOk(error, "isDeviceActive");
  return Boolean(data && !data.revoked_at);
}

export async function listAuthDevices(personId: string): Promise<AuthDevice[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return sampleBag(store)
      .filter((d) => d.person_id === personId && !d.revoked_at)
      .sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at));
  }
  const { data, error } = await getServiceSupabase()
    .from("auth_devices")
    .select("*")
    .eq("person_id", personId)
    .is("revoked_at", null)
    .order("last_seen_at", { ascending: false });
  assertOk(error, "listAuthDevices");
  return ((data ?? []) as Record<string, unknown>[]).map(mapRow);
}

export async function revokeOtherDevices(opts: {
  personId: string;
  keepDeviceId: string | null;
  actorId: string;
}): Promise<number> {
  let count = 0;
  if (isSampleDataMode()) {
    await updateStore((s) => {
      for (const d of sampleBag(s)) {
        if (
          d.person_id === opts.personId &&
          !d.revoked_at &&
          d.id !== opts.keepDeviceId
        ) {
          d.revoked_at = nowIso();
          count += 1;
        }
      }
    });
  } else {
    let q = getServiceSupabase()
      .from("auth_devices")
      .update({ revoked_at: nowIso() })
      .eq("person_id", opts.personId)
      .is("revoked_at", null);
    if (opts.keepDeviceId) {
      q = q.neq("id", opts.keepDeviceId);
    }
    const { data, error } = await q.select("id");
    assertOk(error, "revokeOtherDevices");
    count = (data ?? []).length;
  }
  await logActivity({
    person_id: opts.actorId,
    action: "devices_signed_out_others",
    target: opts.personId,
    meta: { count, keepDeviceId: opts.keepDeviceId },
  });
  return count;
}

export async function revokeDevice(opts: {
  personId: string;
  deviceId: string;
  actorId: string;
}): Promise<boolean> {
  if (isSampleDataMode()) {
    let found = false;
    await updateStore((s) => {
      const d = sampleBag(s).find(
        (x) =>
          x.id === opts.deviceId &&
          x.person_id === opts.personId &&
          !x.revoked_at,
      );
      if (d) {
        d.revoked_at = nowIso();
        found = true;
      }
    });
    if (found) {
      await logActivity({
        person_id: opts.actorId,
        action: "device_signed_out",
        target: opts.deviceId,
      });
    }
    return found;
  }
  const { data, error } = await getServiceSupabase()
    .from("auth_devices")
    .update({ revoked_at: nowIso() })
    .eq("id", opts.deviceId)
    .eq("person_id", opts.personId)
    .is("revoked_at", null)
    .select("id");
  assertOk(error, "revokeDevice");
  const ok = (data ?? []).length > 0;
  if (ok) {
    await logActivity({
      person_id: opts.actorId,
      action: "device_signed_out",
      target: opts.deviceId,
    });
  }
  return ok;
}
