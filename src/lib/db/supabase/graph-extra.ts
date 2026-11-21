import "server-only";
import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { logActivity } from "@/lib/db/repository";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { assertOk, getServiceSupabase } from "@/lib/db/supabase/client";
import {
  ARG_EDGE_TYPES,
  ARG_NODE_KINDS,
  makeEdgeKey,
  type ArgEdge,
  type ArgEdgeType,
  type ArgNodeKind,
  type RecordEdgeInput,
} from "@/lib/graph/types";
import { nowIso } from "@/lib/utils";

/**
 * Workstream K Wave 6: argument graph spine.
 * Migration: 00028_workstream_k_graph_spine.sql
 * Every write path that creates a relationship must call recordEdge().
 */

type SampleWithEdges = {
  arg_edges?: ArgEdge[];
};

function clampWeight(weight: number | undefined): number {
  if (weight == null || Number.isNaN(weight)) return 1;
  return Math.min(1, Math.max(0, weight));
}

function assertKinds(input: RecordEdgeInput): void {
  if (!(ARG_NODE_KINDS as readonly string[]).includes(input.from_kind)) {
    throw new Error(`recordEdge: unknown from_kind ${input.from_kind}`);
  }
  if (!(ARG_NODE_KINDS as readonly string[]).includes(input.to_kind)) {
    throw new Error(`recordEdge: unknown to_kind ${input.to_kind}`);
  }
  if (!(ARG_EDGE_TYPES as readonly string[]).includes(input.type)) {
    throw new Error(`recordEdge: unknown type ${input.type}`);
  }
}

function rowToEdge(row: Record<string, unknown>): ArgEdge {
  return {
    id: String(row.id),
    edge_key: String(row.edge_key),
    from_kind: row.from_kind as ArgNodeKind,
    from_id: String(row.from_id),
    to_kind: row.to_kind as ArgNodeKind,
    to_id: String(row.to_id),
    type: row.type as ArgEdgeType,
    weight: Number(row.weight ?? 1),
    source_kind: (row.source_kind as string | null) ?? null,
    source_id: (row.source_id as string | null) ?? null,
    round_id: (row.round_id as string | null) ?? null,
    line_id: (row.line_id as string | null) ?? null,
    team_id: (row.team_id as string | null) ?? null,
    case_id: (row.case_id as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at ?? nowIso()),
  };
}

function buildEdge(input: RecordEdgeInput): ArgEdge {
  assertKinds(input);
  const edge_key = makeEdgeKey(input);
  return {
    id: randomUUID(),
    edge_key,
    from_kind: input.from_kind,
    from_id: input.from_id,
    to_kind: input.to_kind,
    to_id: input.to_id,
    type: input.type,
    weight: clampWeight(input.weight),
    source_kind: input.source_kind ?? null,
    source_id: input.source_id ?? null,
    round_id: input.round_id ?? null,
    line_id: input.line_id ?? null,
    team_id: input.team_id ?? null,
    case_id: input.case_id ?? null,
    created_by: input.created_by ?? null,
    created_at: nowIso(),
  };
}

/**
 * Idempotent write of one typed argument edge.
 * Same (from, to, type, source) updates weight and provenance; does not duplicate.
 */
export async function recordEdge(input: RecordEdgeInput): Promise<ArgEdge> {
  const edge = buildEdge(input);

  if (isSampleDataMode()) {
    let saved = edge;
    await updateStore((s) => {
      const bag = s as unknown as SampleWithEdges;
      const list = bag.arg_edges ?? [];
      const i = list.findIndex((e) => e.edge_key === edge.edge_key);
      if (i >= 0) {
        saved = {
          ...list[i],
          weight: edge.weight,
          source_kind: edge.source_kind,
          source_id: edge.source_id,
          round_id: edge.round_id ?? list[i].round_id,
          line_id: edge.line_id ?? list[i].line_id,
          team_id: edge.team_id ?? list[i].team_id,
          case_id: edge.case_id ?? list[i].case_id,
          created_by: edge.created_by ?? list[i].created_by,
        };
        list[i] = saved;
      } else {
        list.push(edge);
        saved = edge;
      }
      bag.arg_edges = list;
    });
    if (!input.skipActivityLog) {
      await logActivity({
        person_id: input.created_by ?? null,
        action: "arg_edge_recorded",
        target: saved.id,
        meta: {
          type: saved.type,
          from_kind: saved.from_kind,
          to_kind: saved.to_kind,
          edge_key: saved.edge_key,
        },
      });
    }
    return saved;
  }

  const sb = getServiceSupabase();
  // Omit id and created_at so upsert keeps the existing row identity on conflict.
  const { data, error } = await sb
    .from("arg_edges")
    .upsert(
      {
        edge_key: edge.edge_key,
        from_kind: edge.from_kind,
        from_id: edge.from_id,
        to_kind: edge.to_kind,
        to_id: edge.to_id,
        type: edge.type,
        weight: edge.weight,
        source_kind: edge.source_kind,
        source_id: edge.source_id,
        round_id: edge.round_id,
        line_id: edge.line_id,
        team_id: edge.team_id,
        case_id: edge.case_id,
        created_by: edge.created_by,
      },
      { onConflict: "edge_key" },
    )
    .select("*")
    .single();
  assertOk(error, "recordEdge");
  const saved = rowToEdge((data ?? edge) as Record<string, unknown>);

  if (!input.skipActivityLog) {
    await logActivity({
      person_id: input.created_by ?? null,
      action: "arg_edge_recorded",
      target: saved.id,
      meta: {
        type: saved.type,
        from_kind: saved.from_kind,
        to_kind: saved.to_kind,
        edge_key: saved.edge_key,
      },
    });
  }
  return saved;
}

/** List edges touching a node (as from or to). */
export async function listEdgesForNode(opts: {
  kind: ArgNodeKind;
  id: string;
  type?: ArgEdgeType;
  limit?: number;
}): Promise<ArgEdge[]> {
  const limit = opts.limit ?? 200;

  if (isSampleDataMode()) {
    const store = (await readStore()) as unknown as SampleWithEdges;
    let edges = (store.arg_edges ?? []).filter(
      (e) =>
        (e.from_kind === opts.kind && e.from_id === opts.id) ||
        (e.to_kind === opts.kind && e.to_id === opts.id),
    );
    if (opts.type) edges = edges.filter((e) => e.type === opts.type);
    return edges.slice(0, limit);
  }

  const sb = getServiceSupabase();
  let q = sb
    .from("arg_edges")
    .select("*")
    .or(
      `and(from_kind.eq.${opts.kind},from_id.eq.${opts.id}),and(to_kind.eq.${opts.kind},to_id.eq.${opts.id})`,
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (opts.type) q = q.eq("type", opts.type);
  const { data, error } = await q;
  assertOk(error, "listEdgesForNode");
  return (data ?? []).map((r) => rowToEdge(r as Record<string, unknown>));
}

/** Count edges (admin / flywheel). Sample mode reads the local store. */
export async function countArgEdges(): Promise<number> {
  if (isSampleDataMode()) {
    const store = (await readStore()) as unknown as SampleWithEdges;
    return store.arg_edges?.length ?? 0;
  }
  const sb = getServiceSupabase();
  const { count, error } = await sb
    .from("arg_edges")
    .select("*", { count: "exact", head: true });
  assertOk(error, "countArgEdges");
  return count ?? 0;
}

/** True when migration 00028 stamped graph_spine in app_kv. */
export async function isGraphSpineReady(): Promise<boolean> {
  if (isSampleDataMode()) return true;
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("app_kv")
    .select("key")
    .eq("key", "graph_spine")
    .maybeSingle();
  assertOk(error, "isGraphSpineReady");
  return Boolean(data);
}
