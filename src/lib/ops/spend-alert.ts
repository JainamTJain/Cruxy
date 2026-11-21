import "server-only";
import { CAP_ALERT_RATIO, MONTHLY_CAP_USD_DEFAULT } from "@/lib/constants";
import { isSampleDataMode } from "@/lib/db/config";
import {
  getPersonById,
  getSpendCaps,
  listPeopleFull,
  logActivity,
  sumMonthlySpendUsd,
} from "@/lib/db/repository";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import { sendOpsEmail } from "@/lib/ops/email";
import { nowIso } from "@/lib/utils";

const ALERT_KV_KEY = "spend_alert_80";

function monthKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function alreadyAlertedThisMonth(): Promise<boolean> {
  const key = monthKey();
  if (isSampleDataMode()) {
    const { readStore } = await import("@/lib/db/sample-store");
    const store = await readStore();
    return store.activity_log.some(
      (e) =>
        e.action === "ai_cap_alert_80_emailed" &&
        typeof e.meta?.month === "string" &&
        e.meta.month === key,
    );
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("app_kv")
    .select("value")
    .eq("key", ALERT_KV_KEY)
    .maybeSingle();
  if (error) throw new Error(`spendAlert.kv: ${error.message}`);
  const value = (data?.value ?? {}) as { month?: string };
  return value.month === key;
}

async function markAlertedThisMonth(): Promise<void> {
  const key = monthKey();
  if (isSampleDataMode()) return;
  const sb = getServiceSupabase();
  const { error } = await sb.from("app_kv").upsert({
    key: ALERT_KV_KEY,
    value: { month: key, at: nowIso() },
    updated_at: nowIso(),
  });
  if (error) throw new Error(`spendAlert.mark: ${error.message}`);
}

async function resolveJainamEmail(): Promise<string | null> {
  const env = process.env.TECH_ADMIN_EMAIL?.trim();
  if (env) return env;

  const people = await listPeopleFull();
  const tech = people.find((p) => p.role === "tech_admin" && p.email?.trim());
  if (tech?.email) return tech.email.trim();

  // Stable seed id for Jainam
  const jainam = await getPersonById("a3333333-3333-3333-3333-333333333304");
  return jainam?.email?.trim() || null;
}

export type SpendAlertResult = {
  checked: boolean;
  ratio: number;
  spent: number;
  cap: number;
  emailed: boolean;
  stub: boolean;
  skippedReason?: string;
};

/**
 * If monthly spend is at or above 80% of the cap, email Jainam once per month.
 * Safe to call from a daily cron (Hobby) or after ai_calls land.
 */
export async function checkAndSendSpendAlert(): Promise<SpendAlertResult> {
  let cap = MONTHLY_CAP_USD_DEFAULT;
  try {
    const caps = await getSpendCaps();
    if (caps?.monthly_usd && Number.isFinite(caps.monthly_usd)) {
      cap = Number(caps.monthly_usd);
    }
  } catch {
    const n = Number(process.env.MONTHLY_CAP_USD ?? MONTHLY_CAP_USD_DEFAULT);
    cap = Number.isFinite(n) ? n : MONTHLY_CAP_USD_DEFAULT;
  }

  const spent = await sumMonthlySpendUsd();
  const ratio = cap > 0 ? spent / cap : 0;

  if (ratio < CAP_ALERT_RATIO) {
    return {
      checked: true,
      ratio,
      spent,
      cap,
      emailed: false,
      stub: false,
      skippedReason: "under_80",
    };
  }

  if (ratio >= 1) {
    return {
      checked: true,
      ratio,
      spent,
      cap,
      emailed: false,
      stub: false,
      skippedReason: "at_or_over_100",
    };
  }

  if (await alreadyAlertedThisMonth()) {
    return {
      checked: true,
      ratio,
      spent,
      cap,
      emailed: false,
      stub: false,
      skippedReason: "already_alerted_this_month",
    };
  }

  await logActivity({
    person_id: null,
    action: "ai_cap_alert_80",
    target: "jainam",
    meta: { spent, cap, ratio },
  });

  const to = await resolveJainamEmail();
  if (!to) {
    await logActivity({
      person_id: null,
      action: "ai_cap_alert_80_no_email",
      target: "jainam",
      meta: { spent, cap },
    });
    return {
      checked: true,
      ratio,
      spent,
      cap,
      emailed: false,
      stub: true,
      skippedReason: "no_tech_admin_email",
    };
  }

  const pct = Math.round(ratio * 100);
  const send = await sendOpsEmail({
    to,
    subject: `Crux spend at ${pct}% of monthly cap`,
    text: [
      "Crux spend alert",
      "",
      `Monthly Cruxy spend is at ${pct}% of the cap.`,
      `Spent: $${spent.toFixed(2)}`,
      `Cap: $${cap.toFixed(2)}`,
      "",
      "At 100% everything except reading and flashcard review pauses.",
      "Open the admin spend panel in Crux for detail.",
    ].join("\n"),
    action: "ai_cap_alert_80_email",
    meta: { spent, cap, month: monthKey() },
  });

  if (send.ok) {
    await markAlertedThisMonth();
    await logActivity({
      person_id: null,
      action: "ai_cap_alert_80_emailed",
      target: to,
      meta: { spent, cap, month: monthKey(), stub: send.stub },
    });
  }

  return {
    checked: true,
    ratio,
    spent,
    cap,
    emailed: send.ok,
    stub: send.stub,
    skippedReason: send.ok ? undefined : send.error,
  };
}
