"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageIntro } from "@/components/page-intro";

type TeamRow = {
  teamId: string;
  teamName: string;
  staleCount: number;
  memberCount: number;
};

export default function CoachIndexPage() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/coach/teams")
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json()) as { error?: string };
          throw new Error(j.error ?? "Forbidden");
        }
        return r.json() as Promise<{ teams: TeamRow[] }>;
      })
      .then((d) => setTeams(d.teams))
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <main className="space-y-3 px-4 py-8">
        <p className="text-sm text-cardinal">{error}</p>
        <Link href="/admin" className="text-sm underline">
          Admin
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <PageIntro title="Coach view">
        One screen per team: who practised, who is behind, open Team Brief
        items, and a printable weekly report.
      </PageIntro>
      {!teams.length ? (
        <p className="text-sm text-muted">Loading teams…</p>
      ) : (
        <ul className="space-y-3">
          {teams.map((t) => (
            <li key={t.teamId}>
              <Link
                href={`/coach/${t.teamId}`}
                className="flex items-baseline justify-between gap-3 rounded-2xl border border-ink/10 bg-white px-4 py-3 hover:border-cardinal/40"
              >
                <span className="font-display text-xl font-semibold">
                  {t.teamName}
                </span>
                <span className="text-sm text-muted">
                  {t.staleCount
                    ? `${t.staleCount} behind (5+ days)`
                    : "All practised recently"}{" "}
                  , {t.memberCount} people
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
