"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Row = {
  id: string;
  label: string;
  gap: number;
  judge_name: string | null;
  weight: number | null;
  human_cards: number;
};

export default function CalibrationPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/admin/calibration")
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json()) as { error?: string };
          throw new Error(j.error ?? "Forbidden");
        }
        return r.json() as Promise<{ rows: Row[] }>;
      })
      .then((d) => setRows(d.rows))
      .catch((e: Error) => setError(e.message));
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
        <p className="text-xs font-semibold uppercase tracking-wide text-cardinal">
          Only Jainam
        </p>
        <h1 className="font-display text-3xl font-semibold">Calibration</h1>
        <p className="mt-1 text-sm text-muted">
          Judge weights and Cruxy score gaps. Members never see this.
        </p>
      </div>
      <p className="text-sm">
        Human cards so far:{" "}
        <span className="font-mono">{rows[0]?.human_cards ?? 0}</span>
      </p>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li
            key={r.id}
            className="rounded-2xl border border-ink/10 bg-white/60 px-4 py-3"
          >
            <p className="font-medium">{r.label}</p>
            <p className="mt-1 font-mono text-sm">
              gap {r.gap > 0 ? "+" : ""}
              {r.gap}
              {r.judge_name ? ` · ${r.judge_name}` : ""}
              {r.weight != null ? ` · weight ${r.weight}` : ""}
            </p>
          </li>
        ))}
      </ul>
      <Link href="/admin" className="text-sm underline">
        Back to admin
      </Link>
    </main>
  );
}
