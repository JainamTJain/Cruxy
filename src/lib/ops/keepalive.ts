import "server-only";
import { isSampleDataMode } from "@/lib/db/config";
import { logActivity } from "@/lib/db/repository";
import { getServiceSupabase } from "@/lib/db/supabase/client";

export type KeepaliveResult = {
  ok: boolean;
  sampleMode: boolean;
  pingMs: number;
};

/**
 * Light read so the free Supabase project never pauses over winter break.
 * Vercel Hobby crons run at most daily — once a day is enough.
 */
export async function runSupabaseKeepalive(): Promise<KeepaliveResult> {
  const started = Date.now();

  if (isSampleDataMode()) {
    await logActivity({
      person_id: null,
      action: "supabase_keepalive",
      target: "sample",
      meta: { sample: true },
    });
    return { ok: true, sampleMode: true, pingMs: Date.now() - started };
  }

  const sb = getServiceSupabase();
  const { error } = await sb.from("teams").select("id").limit(1);
  if (error) {
    await logActivity({
      person_id: null,
      action: "supabase_keepalive_error",
      target: "teams",
      meta: { message: error.message },
    });
    throw new Error(`keepalive: ${error.message}`);
  }

  const pingMs = Date.now() - started;
  await logActivity({
    person_id: null,
    action: "supabase_keepalive",
    target: "teams",
    meta: { pingMs },
  });
  return { ok: true, sampleMode: false, pingMs };
}
