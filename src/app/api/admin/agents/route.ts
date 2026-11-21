import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canRead } from "@/lib/admin/permissions";
import {
  AGENT_CATALOG,
  matchAgentFeature,
} from "@/lib/cruxy/agents-catalog";
import { getPersonById } from "@/lib/db/repository";
import { queryAiCallsLedger } from "@/lib/db/supabase/data-model-extra";

export const runtime = "nodejs";

/** F-333: Agent / Job / Model tier / Runs with live ai_calls counts. */
export async function GET() {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const person = await getPersonById(session.personId);
  if (!person || !canRead(person.role, "models")) {
    return NextResponse.json(
      { error: "Agents table is for tech admin." },
      { status: 403 },
    );
  }

  const calls = await queryAiCallsLedger({ limit: 500 });
  const rows = AGENT_CATALOG.map((row) => {
    const matched = calls.filter((c) =>
      matchAgentFeature(c.feature, row.featurePrefixes),
    );
    return {
      agent: row.agent,
      job: row.job,
      tier: row.tier,
      tierNote: row.tierNote,
      runs: row.runs,
      callCount: matched.length,
      costUsd: matched.reduce((s, c) => s + Number(c.cost_usd), 0),
    };
  });

  return NextResponse.json({ rows });
}
