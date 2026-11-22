import { NextResponse } from "next/server";
import { isAdminRole } from "@/lib/admin/permissions";
import { getSession } from "@/lib/auth/session";
import { getPersonById, logActivity } from "@/lib/db/repository";
import {
  getGraphSpineStats,
  isGraphSpineReady,
} from "@/lib/db/supabase/graph-extra";
import { runGraphSpineBackfill } from "@/lib/graph/backfill";
import { GRAPH_EDGE_READERS } from "@/lib/graph/readers";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Admin: graph spine counts (GET). Tech admin runs backfill (POST). */
export async function GET() {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const person = await getPersonById(session.personId);
  if (!person || !isAdminRole(person.role)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const [ready, stats] = await Promise.all([
    isGraphSpineReady(),
    getGraphSpineStats(),
  ]);
  return NextResponse.json({ ready, stats, readers: GRAPH_EDGE_READERS });
}

export async function POST() {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const person = await getPersonById(session.personId);
  if (!person || person.role !== "tech_admin") {
    return NextResponse.json({ error: "Tech admin only" }, { status: 403 });
  }

  const counts = await runGraphSpineBackfill({ personId: person.id });
  // One summary row only (never one row per edge).
  await logActivity({
    person_id: person.id,
    action: "graph_spine_backfill",
    target: "arg_edges",
    meta: counts as unknown as Record<string, unknown>,
  });
  const stats = await getGraphSpineStats();
  return NextResponse.json({
    counts,
    stats,
    readers: GRAPH_EDGE_READERS,
  });
}
