/**
 * Smoke: recordEdge must not write activity_log rows.
 */
import { recordEdge } from "@/lib/graph/recordEdge";
import { readStore } from "@/lib/db/sample-store";
import { GRAPH_EDGE_READERS } from "@/lib/graph/readers";

async function main() {
  process.env.USE_SAMPLE_DATA = "1";
  const before = (await readStore()).activity_log.filter(
    (e) => e.action === "arg_edge_recorded",
  ).length;

  await recordEdge({
    from_kind: "support",
    from_id: "00000000-0000-0000-0000-000000000011",
    to_kind: "claim",
    to_id: "00000000-0000-0000-0000-000000000012",
    type: "supports",
    created_by: "00000000-0000-0000-0000-000000000013",
  });

  const store = await readStore();
  const after = store.activity_log.filter(
    (e) => e.action === "arg_edge_recorded",
  ).length;
  const edges =
    (store as unknown as { arg_edges?: unknown[] }).arg_edges?.length ?? 0;

  if (after !== before) {
    throw new Error("recordEdge wrote activity_log (arg_edge_recorded)");
  }
  if (edges < 1) throw new Error("recordEdge did not persist an edge");

  console.log(
    JSON.stringify(
      {
        ok: true,
        edges,
        arg_edge_recorded_delta: after - before,
        readers: GRAPH_EDGE_READERS,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
