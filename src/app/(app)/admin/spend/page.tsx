"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type SpendData = {
  spent: number;
  ledgerTotal: number;
  matchesLedger: boolean;
  caps: {
    monthly_usd: number;
    per_round_usd: number;
    per_research_night_usd: number;
    per_person_assistant_day_usd: number;
    research_paused: boolean;
  };
  byFeature: { feature: string; cost_usd: number; calls: number }[];
  byPerson: { name: string; cost_usd: number; calls: number }[];
  canEdit: boolean;
  error?: string;
};

export default function SpendPage() {
  const [data, setData] = useState<SpendData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/spend");
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      setError(j.error ?? "Forbidden");
      return;
    }
    setData(await res.json());
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveCaps(patch: Record<string, number | boolean>) {
    const res = await fetch("/api/admin/spend", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    const j = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMsg(j.error ?? "Could not update");
      return;
    }
    setMsg("Caps updated.");
    await load();
  }

  if (error) {
    return (
      <main className="animate-fade-up space-y-3">
        <p className="text-sm text-cardinal">{error}</p>
        <Link href="/admin" className="text-sm underline">
          Back to admin
        </Link>
      </main>
    );
  }
  if (!data) return <p className="text-sm text-muted">Loading spend…</p>;

  return (
    <main className="animate-fade-up space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-cardinal">
          Only Jainam
        </p>
        <h1 className="font-display text-3xl font-semibold">Spend dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          Ledger from <span className="font-mono">ai_calls</span>. Totals must match.
        </p>
      </div>

      <section className="rounded-2xl border border-ink/10 bg-white/60 p-4">
        <p className="font-mono text-3xl">
          ${data.spent.toFixed(2)}{" "}
          <span className="text-lg text-muted">/ ${data.caps.monthly_usd}</span>
        </p>
        <p className="mt-2 text-sm">
          Feature ledger sum: ${data.ledgerTotal.toFixed(2)} ·{" "}
          {data.matchesLedger ? (
            <span className="text-[#1F6F4A]">matches ai_calls</span>
          ) : (
            <span className="text-cardinal">mismatch — investigate</span>
          )}
        </p>
        {data.spent / data.caps.monthly_usd >= 0.8 ? (
          <p className="mt-2 text-sm text-cardinal">At or above 80% — alert Jainam.</p>
        ) : null}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-lg font-semibold">By feature</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {data.byFeature.map((f) => (
              <li
                key={f.feature}
                className="flex justify-between rounded-xl border border-ink/5 bg-white/50 px-3 py-2"
              >
                <span>
                  {f.feature}{" "}
                  <span className="text-xs text-muted">{f.calls} calls</span>
                </span>
                <span className="font-mono">${f.cost_usd.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold">By person</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {data.byPerson.map((p) => (
              <li
                key={p.name + p.cost_usd}
                className="flex justify-between rounded-xl border border-ink/5 bg-white/50 px-3 py-2"
              >
                <span>
                  {p.name}{" "}
                  <span className="text-xs text-muted">{p.calls} calls</span>
                </span>
                <span className="font-mono">${p.cost_usd.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {data.canEdit ? (
        <section className="rounded-2xl border border-cardinal/20 bg-white/70 p-4 space-y-3">
          <h2 className="font-display text-lg font-semibold">Caps</h2>
          <p className="text-sm text-muted">
            Monthly ${data.caps.monthly_usd} · per round ${data.caps.per_round_usd} ·
            research night ${data.caps.per_research_night_usd} · assistant/day $
            {data.caps.per_person_assistant_day_usd}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={data.caps.research_paused ? "gold" : "outline"}
              onClick={() =>
                void saveCaps({ research_paused: !data.caps.research_paused })
              }
            >
              {data.caps.research_paused ? "Resume research" : "Pause research"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void saveCaps({ monthly_usd: 30 })}
            >
              Reset monthly to $30
            </Button>
          </div>
          {msg ? <p className="text-sm text-muted">{msg}</p> : null}
        </section>
      ) : null}

      <Link href="/admin" className="text-sm underline">
        Back to admin
      </Link>
    </main>
  );
}
