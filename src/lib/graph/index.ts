export {
  countArgEdges,
  getGraphSpineStats,
  isGraphSpineReady,
  listEdgesForNode,
  recordEdge,
  ARG_EDGE_TYPES,
  ARG_NODE_KINDS,
  makeEdgeKey,
  type ArgEdge,
  type ArgEdgeType,
  type ArgNodeKind,
  type GraphSpineStats,
  type RecordEdgeInput,
} from "@/lib/graph/recordEdge";

export { listOpenAttackClaimIds } from "@/lib/graph/arg-edges";
export {
  backfillArgEdges,
  backfillNodeEmbeddings,
  reembedStubPassages,
  runGraphSpineBackfill,
  looksLikeStubEmbedding,
  type GraphBackfillCounts,
} from "@/lib/graph/backfill";

export { GRAPH_EDGE_READERS } from "@/lib/graph/readers";
