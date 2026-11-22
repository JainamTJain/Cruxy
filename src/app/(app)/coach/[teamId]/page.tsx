"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PageIntro } from "@/components/page-intro";

type Member = {
  personId: string;
  name: string;
  lastPractisedAt: string | null;
  stale: boolean;
  attendancePresent: number;
  attendanceTotal: number;
  roadmapLine: string;
};

type BriefItem = {
  caseNumber: number | null;
  caseTitle: string;
  text: string;
  kind: string;
};

type Snap = {
  teamId: string;
  teamName: string;
  members: Member[];
  openBriefItems: BriefItem[];
};

export default function CoachTeamPage() {
  const params = useParams<{ teamId: string }>();
  const teamId = params.teamId;
  const [snap, setSnap] = useState<Snap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    void fetch(`/api/coach/teams/${teamId}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json()) as { error?: string };
          throw new Error(j.error ?? "Forbidden");
        }
        return r.json() as Promise<Snap>;
      })
      .then(setSnap)
      .catch((e: Error) => setError(e.message));
  }, [teamId]);

  useEffect(() => {
    load();
  }, [load]);

  async function nudge(personId: string) {
    setMsg(null);
    const res = await fetch("/api/coach/nudge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ personId, teamId }),
    });
    const j = (await res.json()) as { error?: string; message?: string };
    setMsg(j.message ?? j.error ?? (res.ok ? "Nudge sent." : "Failed"));
  }

  if (error) {
    return (
      <main className="space-y-3 px-4 py-8">
        <p className="text-sm text-cardinal">{error}</p>
        <Link href="/coach" className="text-sm underline">
          Coach view
        </Link>
      </main>
    );
  }

  if (!snap) {
    return <p className="px-4 py-8 text-sm text-muted">Loading team…</p>;
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageIntro title={snap.teamName}>
          Attendance, who has not practised in 5 days, roadmap against each
          person&apos;s own past, and open Team Brief items.
        </PageIntro>
        <Link
          href={`/coach/${teamId}/report`}
          className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm font-semibold"
        >
          Printable weekly report
        </Link>
      </div>

      {msg ? <p className="text-sm text-muted">{msg}</p> : null}

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">People</h2>
        <ul className="space-y-3">
          {snap.members.map((m) => (
            <li
              key={m.personId}
              className="rounded-2xl border border-ink/10 bg-white px-4 py-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">
                  {m.name}
                  {m.stale ? (
                    <span className="ml-2 text-xs font-medium text-cardinal">
                      5+ days
                    </span>
                  ) : null}
                </p>
                <button
                  type="button"
                  className="text-sm font-semibold text-cardinal underline"
                  onClick={() => void nudge(m.personId)}
                >
                  Gentle nudge
                </button>
              </div>
              <p className="mt-1 text-sm text-muted">
                Attendance {m.attendancePresent}/{m.attendanceTotal}. Last
                practice{" "}
                {m.lastPractisedAt
                  ? new Date(m.lastPractisedAt).toLocaleDateString()
                  : "never"}
                .
              </p>
              <p className="mt-1 text-sm">{m.roadmapLine}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">
          Open Team Brief items
        </h2>
        {snap.openBriefItems.length === 0 ? (
          <p className="text-sm text-muted">Nothing open on the briefs.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {snap.openBriefItems.map((item, i) => (
              <li
                key={`${item.caseNumber}-${i}`}
                className="rounded-xl bg-paper px-3 py-2"
              >
                <span className="font-medium">
                  Case {item.caseNumber ?? "?"}
                </span>
                : {item.text}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link href="/coach" className="text-sm underline">
        All teams
      </Link>
    </main>
  );
}
