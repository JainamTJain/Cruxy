"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Team = { id: string; name: string; colour: string };
type CaseRow = { id: string; number: number; title: string };
type Cell = {
  team_id: string;
  case_id: string;
  readiness_pct: number;
  lead_names: string[];
  latest_event: string | null;
};
type Change = {
  id: string;
  text: string;
  href: string | null;
  personName: string;
  at: string;
  caseLabel: string | null;
};
type NextAction = {
  label: string;
  detail: string;
  href: string;
};

type DriveStatus = {
  synced: boolean;
  fileCount: number;
  lastSyncAt: string | null;
  canSync: boolean;
};

type TodaySession = {
  sessionId: string;
  roundId: string | null;
  title: string;
  place: string | null;
  online: boolean;
  status: string;
  caseNumber: number | null;
  screen: string;
  href: string;
  invitePending?: boolean;
};

type MemberPractice = {
  id: string;
  title: string;
  date: string;
  status: string;
  creator_name: string | null;
  mode: string | null;
};

type MapData = {
  teams: Team[];
  cases: CaseRow[];
  readiness: Cell[];
  totals: Record<string, number>;
  deltas?: Record<string, string>;
  driveStatus?: DriveStatus;
  teamAverages: { team_id: string; avg: number; delta_week: number }[];
  competition: { name: string; date: string; place: string | null } | null;
  daysToCompetition: number | null;
  changes: Change[];
  nextActions: string[] | NextAction[];
  todayLabel?: string;
  todaySessions?: TodaySession[];
  memberPractices?: MemberPractice[];
};

function initials(names: string[]): string {
  if (!names.length) return "Not set";
  return names
    .map((n) => {
      const parts = n.trim().split(/\s+/);
      if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
      return `${parts[0]!.slice(0, 1)}${parts[parts.length - 1]!.slice(0, 1)}`;
    })
    .join(" ");
}

export default function HomePage() {
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/program-map");
    if (!r.ok) throw new Error("Could not load program map");
    return r.json() as Promise<MapData>;
  }, []);

  useEffect(() => {
    void load()
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [load]);

  const todayLabel = useMemo(() => {
    if (data?.todayLabel) return data.todayLabel;
    return new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }, [data?.todayLabel]);

  async function syncDrive() {
    setSyncBusy(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/library/sync", { method: "POST" });
      const body = (await res.json()) as {
        message?: string;
        error?: string;
        ok?: boolean;
      };
      if (!res.ok || body.ok === false) {
        setSyncMessage(body.error ?? body.message ?? "Sync failed");
      } else {
        setSyncMessage(body.message ?? "Synced");
      }
      const next = await load();
      setData(next);
    } catch (e) {
      setSyncMessage(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncBusy(false);
    }
  }

  if (error) {
    return <p className="text-sm text-cardinal">{error}</p>;
  }
  if (!data) {
    return <p className="text-sm text-muted">Loading program map…</p>;
  }

  const cellFor = (teamId: string, caseId: string) =>
    data.readiness.find((c) => c.team_id === teamId && c.case_id === caseId);

  const drive = data.driveStatus ?? {
    synced: (data.totals.drive_files ?? 0) > 0,
    fileCount: data.totals.drive_files ?? 0,
    lastSyncAt: null,
    canSync: false,
  };

  const totals: {
    key: string;
    label: string;
    delta?: string;
  }[] = [
    {
      key: "ideas_accepted",
      label: "ideas accepted",
      delta: data.deltas?.ideas_accepted,
    },
    {
      key: "sources_verified",
      label: "sources verified",
      delta: data.deltas?.sources_verified,
    },
    {
      key: "bank_questions",
      label: "bank questions",
      delta: data.deltas?.bank_questions,
    },
    {
      key: "rounds_graded",
      label: "rounds graded",
      delta: data.deltas?.rounds_graded,
    },
    {
      key: "redo_improvements",
      label: "redos that improved",
      delta: data.deltas?.redo_improvements,
    },
  ];

  const nextThree: NextAction[] = (data.nextActions ?? []).map((a, i) => {
    if (typeof a === "string") {
      return {
        label: i === 0 ? "DO NEXT" : "NEXT",
        detail: a,
        href: "/revision/roadmap",
      };
    }
    return a;
  });

  const teamColour = (t: Team) => t.colour;

  return (
    <main className="flex flex-col gap-7 animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
            {todayLabel}
          </span>
          <h1 className="font-display m-0 text-[56px] font-extrabold leading-[0.95] tracking-[-0.03em]">
            Where the program stands
          </h1>
        </div>
        {data.daysToCompetition != null && data.competition ? (
          <div className="flex items-center gap-4 rounded-[18px] bg-cardinal px-5 py-3.5 text-white">
            <span className="font-display text-[52px] font-extrabold leading-none">
              {data.daysToCompetition}
            </span>
            <span className="text-sm leading-snug">
              days to UCSB
              <br />
              <span className="text-[#F3D0D6]">
                {data.competition.place
                  ? `${data.competition.name}, ${data.competition.date}`
                  : `Regional, ${data.competition.date}`}
              </span>
            </span>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-2xl bg-white p-4">
          {drive.synced ? (
            <>
              <div className="font-display text-[44px] font-extrabold leading-none">
                {drive.fileCount}
              </div>
              <div className="mt-1.5 text-[13px] text-muted">Drive files read</div>
              {data.deltas?.drive_files ? (
                <div className="mt-1 text-xs font-bold text-[#0F7B6C]">
                  {data.deltas.drive_files}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="font-display text-[22px] font-extrabold leading-snug tracking-[-0.02em]">
                Drive not synced yet
              </div>
              <div className="mt-1.5 text-[13px] text-muted">
                No Drive files digested
              </div>
              {drive.canSync ? (
                <button
                  type="button"
                  disabled={syncBusy}
                  onClick={() => void syncDrive()}
                  className="mt-2 rounded-lg bg-ink px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                >
                  {syncBusy ? "Syncing…" : "Sync now"}
                </button>
              ) : (
                <div className="mt-2 text-xs text-muted">
                  Ask the tech admin to sync
                </div>
              )}
              {syncMessage ? (
                <div className="mt-1 text-xs text-muted">{syncMessage}</div>
              ) : null}
            </>
          )}
        </div>
        {totals.map((t) => (
          <div key={t.key} className="rounded-2xl bg-white p-4">
            <div className="font-display text-[44px] font-extrabold leading-none">
              {data.totals[t.key] ?? 0}
            </div>
            <div className="mt-1.5 text-[13px] text-muted">{t.label}</div>
            {t.delta ? (
              <div className="mt-1 text-xs font-bold text-[#0F7B6C]">
                {t.delta}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <section className="min-w-0 flex-[999_1_640px] overflow-hidden rounded-[20px] bg-white">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pb-3 pt-5">
            <h2 className="font-display m-0 text-2xl font-extrabold">
              Case board
            </h2>
            <span className="text-[13px] text-muted">
              Readiness per team, leads, latest
            </span>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[220px_repeat(3,minmax(0,1fr))] border-t border-[#E3E5E9] bg-[#F7F8FA] text-[13px] font-bold">
                <span className="px-5 py-2.5">Case</span>
                {data.teams.map((t) => (
                  <span
                    key={t.id}
                    className="border-l border-[#E3E5E9] px-3.5 py-2.5"
                    style={{ color: teamColour(t) }}
                  >
                    {t.name}
                  </span>
                ))}
              </div>
              {data.cases.map((c) => (
                <Link
                  key={c.id}
                  href={`/case-brain/${c.id}`}
                  className="grid grid-cols-[220px_repeat(3,minmax(0,1fr))] border-t border-[#E3E5E9]"
                >
                  <span className="flex items-center gap-3 px-5 py-3">
                    <span className="font-display w-[34px] text-[26px] font-extrabold text-cardinal">
                      {c.number}
                    </span>
                    <span className="text-sm font-semibold leading-snug">
                      {c.title}
                    </span>
                  </span>
                  {data.teams.map((t) => {
                    const cell = cellFor(t.id, c.id);
                    const pct = cell?.readiness_pct ?? 0;
                    return (
                      <span
                        key={t.id}
                        className="flex flex-col gap-1.5 border-l border-[#E3E5E9] px-3.5 py-3"
                      >
                        <span className="flex items-center justify-between">
                          <span className="font-mono text-[13px] font-semibold">
                            {pct}%
                          </span>
                          <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-md bg-paper px-1 text-[11px] font-bold text-[#3B404A]">
                            {initials(cell?.lead_names ?? [])}
                          </span>
                        </span>
                        <span className="h-2 overflow-hidden rounded-full bg-[#ECEEF1]">
                          <span
                            className="block h-2 rounded-full"
                            style={{
                              width: `${pct}%`,
                              background: teamColour(t),
                            }}
                          />
                        </span>
                        <span className="text-xs text-muted">
                          {cell?.latest_event || "\u00a0"}
                        </span>
                      </span>
                    );
                  })}
                </Link>
              ))}
            </div>
          </div>
        </section>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
          {(data.todaySessions?.length ?? 0) > 0 ? (
            <section className="flex flex-col gap-3 rounded-[20px] bg-white p-5">
              <h2 className="font-display m-0 text-[22px] font-extrabold">
                Today&apos;s practice
              </h2>
              {data.todaySessions!.map((s) => (
                <div
                  key={s.sessionId}
                  className="flex flex-col gap-2 rounded-xl border border-line p-3"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-bold">{s.title}</span>
                    <span className="text-xs text-muted">
                      {s.online ? "Online" : s.place ?? "In person"}
                      {s.caseNumber != null ? `, Case ${s.caseNumber}` : ""}
                    </span>
                  </div>
                  {s.invitePending ? (
                    <button
                      type="button"
                      className="h-10 rounded-xl bg-ink px-4 text-sm font-semibold text-white"
                      onClick={() => {
                        void fetch("/api/practice/invite", {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({
                            action: "accept",
                            sessionId: s.sessionId,
                          }),
                        }).then(async (r) => {
                          const d = await r.json();
                          if (r.ok && d.href) window.location.href = d.href;
                        });
                      }}
                    >
                      Accept invite
                    </button>
                  ) : (
                    <Link
                      href={s.href}
                      className="inline-flex h-10 items-center justify-center rounded-xl bg-cardinal px-4 text-sm font-semibold text-white"
                    >
                      Join as {s.screen}
                    </Link>
                  )}
                </div>
              ))}
            </section>
          ) : null}

          {(data.memberPractices?.length ?? 0) > 0 ? (
            <section className="flex flex-col gap-3 rounded-[20px] bg-white p-5">
              <h2 className="font-display m-0 text-[22px] font-extrabold">
                Member practices
              </h2>
              <p className="m-0 text-xs text-muted">
                Admins can see these. No approval needed.
              </p>
              {data.memberPractices!.map((p) => (
                <Link
                  key={p.id}
                  href={`/practice/sessions/${p.id}`}
                  className="flex flex-col gap-0.5 rounded-xl border border-line p-3 text-sm"
                >
                  <span className="font-bold">{p.title}</span>
                  <span className="text-xs text-muted">
                    {p.date}, {p.creator_name ?? "member"}, {p.status}
                  </span>
                </Link>
              ))}
            </section>
          ) : null}

          <section className="flex flex-col gap-3 rounded-[20px] bg-ink p-5 text-white">
            <h2 className="font-display m-0 text-[22px] font-extrabold">
              Your next three
            </h2>
            {nextThree.length === 0 ? (
              <p className="text-sm text-[#9AA0AA]">Nothing overdue. Nice work.</p>
            ) : (
              nextThree.slice(0, 3).map((a) => (
                <Link
                  key={a.detail}
                  href={a.href}
                  className="flex flex-col gap-1 rounded-xl bg-[#1E2129] p-3"
                >
                  <span className="text-xs font-bold text-gold">{a.label}</span>
                  <span className="text-[15px] leading-snug">{a.detail}</span>
                </Link>
              ))
            )}
          </section>

          <section className="flex flex-col gap-3.5 rounded-[20px] bg-white p-5">
            <h2 className="font-display m-0 text-[22px] font-extrabold">
              Since you were here
            </h2>
            <div className="flex flex-col gap-3 text-sm leading-snug">
              {data.changes.length === 0 ? (
                <span className="text-muted">Nothing new yet.</span>
              ) : (
                data.changes.slice(0, 8).map((e) =>
                  e.href ? (
                    <Link
                      key={e.id}
                      href={e.href}
                      className="text-ink underline-offset-2 hover:underline"
                    >
                      {e.text}
                    </Link>
                  ) : (
                    <span key={e.id}>{e.text}</span>
                  ),
                )
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
