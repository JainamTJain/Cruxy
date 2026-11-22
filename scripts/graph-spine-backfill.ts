/**
 * Tech-admin / CI helper: run graph spine backfill against the configured DB.
 * Usage: NODE_OPTIONS='--require ./scripts/preload-server-only.cjs' tsx scripts/graph-spine-backfill.ts
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (and AI gateway for embeds).
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

async function main() {
  if (process.env.USE_SAMPLE_DATA === "1") {
    console.log("USE_SAMPLE_DATA=1; refusing to run live backfill.");
    process.exit(1);
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Skip (no live credentials in this environment).",
    );
    process.exit(0);
  }

  const { getGraphSpineStats } = await import(
    "@/lib/db/supabase/graph-extra"
  );
  const { runGraphSpineBackfill } = await import("@/lib/graph/backfill");
  const { logActivity } = await import("@/lib/db/repository");

  const before = await getGraphSpineStats();
  console.log("Before:", JSON.stringify(before, null, 2));

  const counts = await runGraphSpineBackfill({ personId: null });
  await logActivity({
    person_id: null,
    action: "graph_spine_backfill",
    target: "arg_edges",
    meta: counts as unknown as Record<string, unknown>,
  });

  const after = await getGraphSpineStats();
  console.log("Counts:", JSON.stringify(counts, null, 2));
  console.log("After:", JSON.stringify(after, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
