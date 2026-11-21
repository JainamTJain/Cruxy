/**
 * Public entry for the Wave 6 argument graph.
 * H, F, E and every claim-map / Truth Source / proposal / transcript /
 * judge write path should import recordEdge from here.
 */
export {
  countArgEdges,
  isGraphSpineReady,
  listEdgesForNode,
  recordEdge,
} from "@/lib/db/supabase/graph-extra";

export {
  ARG_EDGE_TYPES,
  ARG_NODE_KINDS,
  makeEdgeKey,
  type ArgEdge,
  type ArgEdgeType,
  type ArgNodeKind,
  type RecordEdgeInput,
} from "@/lib/graph/types";
