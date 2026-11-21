"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { RoadmapStage, RoadmapStageId } from "@/lib/revision/types";
import { ROADMAP_STAGES } from "@/lib/revision/types";
import type { CaseRow } from "@/lib/types";
import { cn } from "@/lib/utils";

type View = {
  cases: {
    case: CaseRow;
    stages: RoadmapStage[];
    readiness: number;
  }[];
  doNext: string[];
  competitionDate: string;
};

const LABELS: Record<RoadmapStageId, string> = {
  read: "Read",
  map: "Map",
  one_pager: "One pager",
  flashcards: "Flashcards",
  question_drill: "Q drill",
  practiced: "Practiced",
  judged: "Judged",
};

function stageStatus(
  s: RoadmapStage,
  today: string,
): "done" | "overdue" | "todo" | "skip" {
  if (s.done_at) return "done";
  if (!s.required) return "skip";
  if (s.due && s.due < today) return "overdue";
  return "todo";
}

export default function RoadmapPage() {
  const [view, setView] = useState<View | null>(null);

  useEffect(() => {
    void fetch("/api/revision/roadmap")
      .then((r) => r.json() as Promise<View>)
      .then(setView);
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  const overall = useMemo(() => {
    if (!view?.cases.length) return 0;
    const sum = view.cases.reduce((acc, c) => acc + c.readiness, 0);
    return Math.round(sum / view.cases.length);
  }, [view]);

  const overdueCount = useMemo(() => {
    if (!view) return 0;
    let n = 0;
    for (const row of view.cases) {
      for (const s of row.stages) {
        if (stageStatus(s, today) === "overdue") n += 1;
      }
    }
    return n;
  }, [view, today]);

  const ribbonDates = useMemo(() => {
    if (!view) return [];
    const byDate = new Map<string, string>();
    for (const row of view.cases) {
      for (const s of row.stages) {
        if (!s.due || !s.required) continue;
        if (!byDate.has(s.due)) byDate.set(s.due, LABELS[s.stage]);
      }
    }
    return [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, 6)
      .map(([date, label]) => ({ date, label }));
  }, [view]);

  return (
    <main className="animate-fade-up space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Personal journey
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold">
            My roadmap
          </h1>
          <p className="mt-1 text-sm text-muted">
            Seven stations per case · deadlines counted back from{" "}
            {view?.competitionDate ?? "…"}. Never ranked against other people.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="rounded-2xl border border-ink/10 bg-white/70 px-4 py-3 text-center">
            <p className="font-display text-3xl font-semibold tabular-nums">
              {overall}%
            </p>
            <p className="text-[11px] text-muted">ready overall</p>
          </div>
          <div
            className={cn(
              "rounded-2xl border px-4 py-3 text-center",
              overdueCount
                ? "border-cardinal/30 bg-cardinal/10 text-cardinal"
                : "border-ink/10 bg-white/70 text-muted",
            )}
          >
            <p className="font-display text-3xl font-semibold tabular-nums">
              {overdueCount}
            </p>
            <p className="text-[11px]">overdue</p>
          </div>
        </div>
      </div>

      {ribbonDates.length ? (
        <section className="overflow-hidden rounded-2xl border border-ink/10 bg-ink text-paper">
          <div className="border-b border-paper/10 px-4 py-2 text-xs text-paper/70">
            Recommended deadlines to {view?.competitionDate ?? "Dec 5"}
          </div>
          <div className="relative flex gap-0 overflow-x-auto px-2 py-4">
            <div className="pointer-events-none absolute inset-x-4 top-1/2 h-px -translate-y-1/2 bg-gold/40" />
            {ribbonDates.map((f) => {
              const isPast = f.date < today;
              const isToday = f.date === today;
              return (
                <div
                  key={f.date}
                  className="relative z-[1] flex min-w-[5.5rem] flex-1 flex-col items-center px-2"
                >
                  <div
                    className={cn(
                      "mb-2 h-3 w-3 rounded-full ring-2 ring-ink",
                      isToday
                        ? "bg-gold"
                        : isPast
                          ? "bg-cardinal"
                          : "bg-paper/80",
                    )}
                  />
                  <p className="text-center text-[10px] font-medium text-gold">
                    {f.label}
                  </p>
                  <p className="font-mono text-[10px] text-paper/60">
                    {f.date.slice(5)}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="border-t border-paper/10 px-4 py-2 text-[11px] text-paper/55">
            Today · {today.slice(5)}
          </div>
        </section>
      ) : null}

      {view?.doNext.length ? (
        <section className="rounded-2xl border border-ink/10 bg-white/70 p-4">
          <h2 className="font-display text-lg font-semibold">Do next</h2>
          <ol className="mt-3 space-y-2">
            {view.doNext.map((d, i) => (
              <li
                key={d}
                className="flex gap-3 rounded-xl bg-paper/80 px-3 py-2 text-sm"
              >
                <span className="font-display text-lg font-semibold text-cardinal">
                  {i + 1}
                </span>
                <span className="pt-0.5">{d}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-xl font-semibold">
            My cases, stage by stage
          </h2>
          <p className="text-sm text-muted">
            Done · In progress · Overdue · Not needed for your role
          </p>
        </div>

        {view?.cases.map(({ case: c, stages, readiness }) => {
          const byId = new Map(stages.map((s) => [s.stage, s]));
          const ordered = ROADMAP_STAGES.map(
            (id) => byId.get(id) ?? null,
          ).filter(Boolean) as RoadmapStage[];

          return (
            <div
              key={c.id}
              className="rounded-2xl border border-ink/10 bg-white/70 p-4"
            >
              <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg font-semibold">
                    <span className="font-mono text-xs text-muted">
                      {String(c.number).padStart(2, "0")}
                    </span>{" "}
                    {c.title}
                  </h3>
                  <p className="text-xs text-muted">
                    Readiness {readiness}% ·{" "}
                    <Link
                      href={`/case-brain/${c.id}`}
                      className="underline"
                    >
                      Case brain
                    </Link>
                  </p>
                </div>
              </div>

              <div className="relative">
                <div className="pointer-events-none absolute left-0 right-0 top-3.5 hidden h-0.5 bg-mist sm:block" />
                <div className="flex flex-wrap gap-2 sm:flex-nowrap sm:justify-between">
                  {ordered.map((s) => {
                    const st = stageStatus(s, today);
                    return (
                      <div
                        key={s.id}
                        className="relative z-[1] flex min-w-[4.5rem] flex-1 flex-col items-center text-center"
                        title={s.due ? `due ${s.due}` : undefined}
                      >
                        <div
                          className={cn(
                            "mb-2 flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold",
                            st === "done" && "bg-gold text-ink",
                            st === "overdue" && "bg-cardinal text-white",
                            st === "todo" &&
                              "border-2 border-ink/25 bg-paper text-ink",
                            st === "skip" &&
                              "border border-dashed border-ink/20 bg-transparent text-muted",
                          )}
                        >
                          {st === "done" ? "✓" : st === "overdue" ? "!" : ""}
                        </div>
                        <p
                          className={cn(
                            "text-[11px] font-medium leading-tight",
                            st === "skip" && "text-muted line-through",
                            st === "overdue" && "text-cardinal",
                          )}
                        >
                          {LABELS[s.stage]}
                        </p>
                        <p className="font-mono text-[9px] text-muted">
                          {st === "done"
                            ? "Done"
                            : st === "skip"
                              ? "—"
                              : s.due
                                ? s.due.slice(5)
                                : "To do"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}
