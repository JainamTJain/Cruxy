"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

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
};

const COST_PLAN = [
  {
    label: "Transcription with speaker labels",
    detail:
      "AssemblyAI Universal-3.5 Pro for rounds; Universal-2 for solo drills. About $9 to $15 a month; early months covered by the $50 credit.",
  },
  {
    label: "Drive digesting",
    detail: "Small tier once per file, then only on changes. Under $1 once; cents after.",
  },
  {
    label: "Judging and reports",
    detail: "Strong tier, one call per round with the whole transcript. About $4 to $15.",
  },
  {
    label: "Nightly research",
    detail: "Small tier in batch; strong only to verify. About $2 to $5.",
  },
  {
    label: "Assistant, drills, flashcards",
    detail: "Mostly small tier. About $1 to $3.",
  },
  {
    label: "Hosting, database, email",
    detail: "Vercel and Supabase free tiers; free email tier for the weekly summary. $0 at this size.",
  },
] as const;

const CHEAP_RULES = [
  "Digest once and only re-digest changed files",
  "Search before sending context",
  "Cache the fixed prompt prefix",
  "Batch overnight work",
  "Delete audio after transcription",
  "Never send a whole library",
] as const;

function bucketLabel(feature: string): string {
  const f = feature.toLowerCase();
  if (f.includes("transcri") || f.includes("assembly")) return "Transcription";
  if (
    f.includes("judge") ||
    f.includes("report") ||
    f.includes("feedback") ||
    f.includes("calib")
  ) {
    return "Judging and reports";
  }
  if (f.includes("research") || f.includes("librarian") || f.includes("digest")) {
    return "Research";
  }
  return "Assistant and drills";
}

export default function SpendPage() {
  const [data, setData] = useState<SpendData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [draftCaps, setDraftCaps] = useState({
    monthly_usd: 30,
    per_round_usd: 0.75,
    per_research_night_usd: 0.25,
    per_person_assistant_day_usd: 0.2,
  });

  async function load() {
    const res = await fetch("/api/admin/spend");
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      setError(j.error ?? "Forbidden");
      return;
    }
    const next = (await res.json()) as SpendData;
    setData(next);
    setDraftCaps({
      monthly_usd: next.caps.monthly_usd,
      per_round_usd: next.caps.per_round_usd,
      per_research_night_usd: next.caps.per_research_night_usd,
      per_person_assistant_day_usd: next.caps.per_person_assistant_day_usd,
    });
  }

  useEffect(() => {
    void load();
  }, []);

  const grouped = useMemo(() => {
    if (!data) return [];
    const buckets: Record<string, number> = {
      Transcription: 0,
      "Judging and reports": 0,
      Research: 0,
      "Assistant and drills": 0,
    };
    for (const row of data.byFeature) {
      buckets[bucketLabel(row.feature)] =
        (buckets[bucketLabel(row.feature)] ?? 0) + row.cost_usd;
    }
    return Object.entries(buckets).map(([label, cost_usd]) => ({
      label,
      cost_usd,
      note:
        label === "Transcription" && cost_usd === 0 ? "free credit" : undefined,
    }));
  }, [data]);

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
        <p className="text-xs font-bold tracking-[0.08em] text-[#8A6500]">
          ONLY JAINAM
        </p>
        <p className="text-sm text-cardinal">{error}</p>
        <Link href="/admin" className="text-sm underline">
          Back to admin
        </Link>
      </main>
    );
  }
  if (!data) return <p className="text-sm text-muted">Loading spend…</p>;

  const pct = Math.min(
    100,
    Math.round((data.spent / (data.caps.monthly_usd || 30)) * 100),
  );

  return (
    <main className="animate-fade-up flex flex-col gap-5">
      <div>
        <span className="rounded-md bg-[#FFF3C4] px-1.5 py-0.5 text-[11px] font-bold tracking-[0.08em] text-[#8A6500]">
          ONLY JAINAM
        </span>
        <h1 className="font-display mt-2 text-[40px] font-extrabold leading-none tracking-[-0.02em]">
          Spend this month
        </h1>
        <p className="mt-2 text-sm text-muted">
          Cost ledger against the $30 hard cap. Never shows keys.
        </p>
      </div>

      <section className="flex flex-col gap-3 rounded-[20px] bg-white p-5">
        <div className="flex items-baseline justify-between gap-2">
          <strong>Spend this month</strong>
          <span className="font-mono text-lg font-semibold">
            ${data.spent.toFixed(2)} / ${data.caps.monthly_usd}
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-[#ECEEF1]">
          <div className="h-2.5 rounded-full bg-ink" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-sm">
          Feature ledger sum: ${data.ledgerTotal.toFixed(2)}.{" "}
          {data.matchesLedger ? (
            <span className="font-bold text-[#0B5E53]">matches the cost ledger</span>
          ) : (
            <span className="font-bold text-cardinal">mismatch</span>
          )}
        </p>
        {pct >= 80 ? (
          <p className="text-sm font-bold text-cardinal">At or above 80%. Watch the cap.</p>
        ) : null}
        <div className="grid grid-cols-[1fr_auto] gap-1.5 text-[13px]">
          {grouped.map((f) => (
            <div key={f.label} className="contents">
              <span>{f.label}</span>
              <span className="font-mono">
                ${f.cost_usd.toFixed(2)}
                {f.note ? ` (${f.note})` : ""}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[20px] bg-white p-5">
          <h2 className="font-display text-lg font-semibold">By feature (raw)</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {data.byFeature.length === 0 ? (
              <li className="text-muted">No calls this month.</li>
            ) : (
              data.byFeature.map((f) => (
                <li
                  key={f.feature}
                  className="flex justify-between rounded-[10px] bg-[#F7F8FA] px-3 py-2"
                >
                  <span>
                    {f.feature}{" "}
                    <span className="text-xs text-muted">{f.calls} calls</span>
                  </span>
                  <span className="font-mono">${f.cost_usd.toFixed(2)}</span>
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="rounded-[20px] bg-white p-5">
          <h2 className="font-display text-lg font-semibold">By person</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {data.byPerson.length === 0 ? (
              <li className="text-muted">No calls this month.</li>
            ) : (
              data.byPerson.map((p) => (
                <li
                  key={p.name + p.cost_usd}
                  className="flex justify-between rounded-[10px] bg-[#F7F8FA] px-3 py-2"
                >
                  <span>
                    {p.name}{" "}
                    <span className="text-xs text-muted">{p.calls} calls</span>
                  </span>
                  <span className="font-mono">${p.cost_usd.toFixed(2)}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>

      {data.canEdit ? (
        <section className="flex flex-col gap-3 rounded-[20px] bg-white p-5">
          <strong>Caps (enforced in the one Cruxy gateway)</strong>
          <p className="text-sm text-muted">
            Monthly hard cap ${data.caps.monthly_usd}. At 80% you get an alert;
            at 100% everything except reading and flashcard review pauses. Per
            round ${data.caps.per_round_usd}, research night $
            {data.caps.per_research_night_usd}, assistant per person per day $
            {data.caps.per_person_assistant_day_usd}.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["monthly_usd", "Monthly $"],
                ["per_round_usd", "Per round $"],
                ["per_research_night_usd", "Research night $"],
                ["per_person_assistant_day_usd", "Assistant / day $"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex flex-col gap-1 text-xs text-muted">
                {label}
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="h-[38px] rounded-[10px] border border-mist bg-white px-3 font-mono text-[13px] text-ink"
                  value={draftCaps[key]}
                  onChange={(e) =>
                    setDraftCaps((d) => ({
                      ...d,
                      [key]: Number(e.target.value),
                    }))
                  }
                />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="h-[38px] rounded-[10px] bg-ink px-3 text-[13px] font-semibold text-white"
              onClick={() => void saveCaps(draftCaps)}
            >
              Save caps
            </button>
            <button
              type="button"
              className="h-[38px] rounded-[10px] border border-mist bg-white px-3 text-[13px] font-semibold"
              onClick={() =>
                void saveCaps({ research_paused: !data.caps.research_paused })
              }
            >
              {data.caps.research_paused ? "Resume research" : "Pause research"}
            </button>
            <button
              type="button"
              className="h-[38px] rounded-[10px] border border-mist bg-white px-3 text-[13px] font-semibold"
              onClick={() =>
                void saveCaps({
                  monthly_usd: 30,
                  per_round_usd: 0.75,
                  per_research_night_usd: 0.25,
                  per_person_assistant_day_usd: 0.2,
                })
              }
            >
              Reset to plan defaults
            </button>
          </div>
          {msg ? <p className="text-sm text-muted">{msg}</p> : null}
        </section>
      ) : null}

      <section className="flex flex-col gap-3 rounded-[20px] bg-white p-5">
        <strong>Cost plan</strong>
        <p className="text-sm text-muted">
          Rough monthly estimates at this program size. Live spend above is the
          source of truth.
        </p>
        <ul className="space-y-2 text-sm">
          {COST_PLAN.map((row) => (
            <li
              key={row.label}
              className="rounded-[10px] bg-[#F7F8FA] px-3 py-2"
            >
              <strong className="block">{row.label}</strong>
              <span className="text-muted">{row.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3 rounded-[20px] bg-white p-5">
        <strong>What keeps it cheap</strong>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          {CHEAP_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </section>

      <Link href="/admin" className="text-sm underline">
        Back to admin
      </Link>
    </main>
  );
}
