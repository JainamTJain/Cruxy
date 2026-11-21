"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { RoadmapStage, RoadmapStageId } from "@/lib/revision/types";
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

export default function RoadmapPage() {
  const [view, setView] = useState<View | null>(null);
  const [status, setStatus] = useState("");
  const [teamId, setTeamId] = useState("");

  async function refresh() {
    const res = await fetch("/api/revision/roadmap");
    setView((await res.json()) as View);
  }

  useEffect(() => {
    void (async () => {
      const meta = await fetch("/api/revision/one-pagers").then((r) => r.json());
      if (meta.teams?.[0]) setTeamId(meta.teams[0].id);
      await refresh();
    })();
  }, []);

  async function demoActivity(action: string, caseId: string) {
    await fetch("/api/revision/roadmap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action,
        caseId,
        teamId: teamId || undefined,
        fileId: "core-case-set",
        openedRatio: 0.75,
        score: action === "judged" ? 42 : undefined,
      }),
    });
    setStatus(`Recorded ${action}`);
    await refresh();
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="animate-fade-up space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Personal roadmap</h1>
        <p className="mt-1 text-sm text-muted">
          Seven stages per case · deadlines counted back from{" "}
          {view?.competitionDate ?? "…"}. Stages mark done from real activity —
          never against other people.
        </p>
      </div>

      {view?.doNext.length ? (
        <section className="rounded-2xl border border-ink/10 bg-white/70 p-4">
          <h2 className="font-display text-lg font-semibold">Do next</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            {view.doNext.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="space-y-4">
        {view?.cases.map(({ case: c, stages, readiness }) => (
            <div
              key={c.id}
              className="rounded-2xl border border-ink/10 bg-white/60 p-4"
            >
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="font-display text-lg font-semibold">
                    <span className="font-mono text-xs text-muted">
                      {String(c.number).padStart(2, "0")}
                    </span>{" "}
                    {c.title}
                  </h2>
                  <p className="text-xs text-muted">Readiness {readiness}%</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void demoActivity("reading", c.id)}
                  >
                    Log read
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void demoActivity("map_review", c.id)}
                  >
                    Log map
                  </Button>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {stages
                  .slice()
                  .sort((a, b) => a.stage.localeCompare(b.stage))
                  .map((s) => {
                    const overdue =
                      s.required && !s.done_at && s.due && s.due < today;
                    return (
                      <div
                        key={s.id}
                        className={cn(
                          "min-w-[5.5rem] rounded-xl px-2 py-2 text-center text-xs",
                          s.done_at
                            ? "bg-gold/25 text-ink"
                            : overdue
                              ? "bg-cardinal/15 text-cardinal"
                              : s.required
                                ? "bg-mist text-ink"
                                : "bg-transparent text-muted line-through",
                        )}
                        title={s.due ? `due ${s.due}` : ""}
                      >
                        <div className="font-medium">{LABELS[s.stage]}</div>
                        <div className="text-[10px]">
                          {s.done_at ? "done" : s.due ?? "—"}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
      </div>
      {status ? <p className="text-xs text-muted">{status}</p> : null}
    </main>
  );
}
