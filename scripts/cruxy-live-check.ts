/**
 * Live AI Gateway smoke check for Workstream M.
 * Requires AI_GATEWAY_API_KEY (and Gateway credits for ZDR).
 * Never prints keys. Safe to run once credits are in.
 *
 *   npx tsx scripts/cruxy-live-check.ts
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

// Sample store so cap / activity logging works without Supabase.
process.env.USE_SAMPLE_DATA = process.env.USE_SAMPLE_DATA || "1";

async function main() {
  const key = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!key) {
    console.error(
      "SKIP: AI_GATEWAY_API_KEY is not set. Add Gateway credits and the key, then re-run.",
    );
    process.exit(2);
  }

  const { callCruxy } = await import("../src/lib/cruxy/callCruxy");
  const {
    getModelSettings,
    updateModelSettings,
    resetModelSettingsOverrides,
  } = await import("../src/lib/cruxy/models");

  const settings = await getModelSettings();
  console.log("Tiers:");
  for (const tier of ["small", "strong", "embed"] as const) {
    const row = settings[tier];
    console.log(
      `  ${tier}: ${row.model}` +
        (row.fallbacks.length ? ` → fallbacks ${row.fallbacks.join(", ")}` : " (no fallback)"),
    );
  }

  console.log("\n1) small call…");
  const small = await callCruxy({
    feature: "live_check_small",
    tier: "small",
    effort: "none",
    messages: [
      {
        role: "system",
        content: "You are Cruxy. Reply with exactly one short sentence.",
      },
      { role: "user", content: "Say hello in five words or fewer." },
    ],
  });
  if (!small.ok) {
    console.error("FAIL small:", small.reason);
    process.exit(1);
  }
  if (small.stub) {
    console.error("FAIL small: still stubbed despite key");
    process.exit(1);
  }
  console.log(
    `  model=${small.model} cost_usd=${small.costUsd} zdr=${Boolean(small.zeroDataRetention)} tokens=${small.tokensIn}/${small.tokensOut}`,
  );
  console.log(`  text=${JSON.stringify(small.text.slice(0, 120))}`);

  console.log("\n2) strong call…");
  const strong = await callCruxy({
    feature: "live_check_strong",
    tier: "strong",
    effort: "low",
    messages: [
      {
        role: "system",
        content: "You are Cruxy. Reply with exactly one short sentence.",
      },
      { role: "user", content: "Name one Ethics Bowl scoring category." },
    ],
  });
  if (!strong.ok) {
    console.error("FAIL strong:", strong.reason);
    process.exit(1);
  }
  if (strong.stub) {
    console.error("FAIL strong: still stubbed despite key");
    process.exit(1);
  }
  console.log(
    `  model=${strong.model} cost_usd=${strong.costUsd} zdr=${Boolean(strong.zeroDataRetention)} tokens=${strong.tokensIn}/${strong.tokensOut}`,
  );
  console.log(`  text=${JSON.stringify(strong.text.slice(0, 120))}`);

  console.log("\n3) forced-failure fallback (bad primary)…");
  const backup = settings.small.fallbacks[0];
  if (!backup) {
    console.error("FAIL: small tier has no fallback configured");
    process.exit(1);
  }
  await updateModelSettings({
    tier: "small",
    model: "openai/this-model-does-not-exist-cruxy-live-check",
    fallbacks: [backup],
  });
  try {
    const fallback = await callCruxy({
      feature: "live_check_fallback",
      tier: "small",
      effort: "none",
      messages: [
        {
          role: "system",
          content: "You are Cruxy. Reply with exactly one short sentence.",
        },
        { role: "user", content: "Reply with the word ok." },
      ],
    });
    if (!fallback.ok) {
      console.error("FAIL fallback call:", fallback.reason);
      process.exit(1);
    }
    if (fallback.stub) {
      console.error("FAIL fallback: stubbed");
      process.exit(1);
    }
    const usedBackup =
      fallback.model === backup ||
      fallback.model.includes(backup.split("/")[1] ?? backup);
    console.log(
      `  model=${fallback.model} cost_usd=${fallback.costUsd} expected_backup=${backup} matched=${usedBackup}`,
    );
    if (!usedBackup) {
      console.error(
        "FAIL: expected backup model to answer after bad primary.",
      );
      process.exit(1);
    }
  } finally {
    await resetModelSettingsOverrides();
  }

  console.log("\nAll live checks passed (model used + cost logged; key not printed).");
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
