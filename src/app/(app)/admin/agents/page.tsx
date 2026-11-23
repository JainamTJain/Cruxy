"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Row = {
  agent: string;
  job: string;
  tier: string;
  tierNote: string;
  runs: string;
  callCount: number;
  costUsd: number;
};

export default function AgentsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/admin/agents")
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json()) as { error?: string };
          throw new Error(j.error ?? "Forbidden");
        }
        return r.json() as Promise<{ rows: Row[] }>;
      })
      .then((d) => setRows(d.rows))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (error) {
    return (
      <main className="animate-fade-up space-y-3">
        <p className="text-sm text-cardinal">{error}</p>
        <Link href="/admin" className="text-sm underline">
          Back
        </Link>
      </main>
    );
  }

  return (
    <main className="animate-fade-up space-y-6">
      <div>
        <Link href="/admin" className="text-xs text-muted underline">
          Admin
        </Link>
        <h1 className="font-display text-3xl font-semibold">Cruxy agents</h1>
        <p className="mt-1 text-sm text-muted">
          Agent, job, model tier, and run counts from the cost ledger.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : !rows.length ? (
        <p className="text-sm text-muted">No agent runs yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3 font-semibold">Agent</th>
                <th className="py-2 pr-3 font-semibold">Job</th>
                <th className="py-2 pr-3 font-semibold">Model tier</th>
                <th className="py-2 pr-3 font-semibold">Runs</th>
                <th className="py-2 font-semibold">Calls</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.agent} className="border-b border-ink/5 align-top">
                  <td className="py-3 pr-3 font-display font-semibold capitalize">
                    {r.agent}
                  </td>
                  <td className="py-3 pr-3 text-[13px] leading-snug">{r.job}</td>
                  <td className="py-3 pr-3">
                    <span className="font-mono text-xs">{r.tier}</span>
                    <p className="mt-1 text-xs text-muted">{r.tierNote}</p>
                  </td>
                  <td className="py-3 pr-3 text-xs text-muted">{r.runs}</td>
                  <td className="py-3 font-mono text-xs">
                    {r.callCount}
                    <span className="mt-1 block text-muted">
                      ${r.costUsd.toFixed(3)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted">
        Tier models are set under{" "}
        <Link href="/admin#models" className="underline">
          Models
        </Link>
        .
      </p>
    </main>
  );
}
