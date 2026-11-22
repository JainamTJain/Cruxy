/**
 * Confirm Wave 6 readers soft-depend on K's arg_edges.
 * Used by admin stats and the PR report; no DB I/O.
 */
export const GRAPH_EDGE_READERS = {
  robustness: {
    module: "@/lib/arg-graph/score-case",
    uses: "listEdgesForCase + synthesizeClaimMapEdges into DF-QuAD",
  },
  mastery: {
    module: "@/lib/mastery/compute",
    uses: "arg_edges claim node ids when map versions are empty",
  },
  calibration: {
    module: "@/lib/practice/calibrated-judge",
    uses: "judge card pairs / kappa (not edges); flywheel edges tile is separate",
  },
  flywheel: {
    module: "@/lib/db/supabase/flywheel-extra",
    uses: "arg_edges for edges-per-day and open vs answered attacks",
  },
} as const;
