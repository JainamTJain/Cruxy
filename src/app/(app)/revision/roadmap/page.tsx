"use client";

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { useCruxy } from "@/components/cruxy/cruxy-context";
import type { RoadmapStage, RoadmapStageId } from "@/lib/revision/types";
import type { CaseRow } from "@/lib/types";

type View = {
  cases: {
    case: CaseRow;
    stages: RoadmapStage[];
    readiness: number;
    role?: string;
    tag?: string;
  }[];
  doNext: string[];
  competitionDate: string;
  assignments?: {
    title: string;
    by: string;
    due: string | null;
    overdue?: boolean;
    accent?: "overdue" | "redo" | "normal";
  }[];
  personName?: string;
  teamName?: string;
  overallReady?: number;
  overdueCount?: number;
};

const STAGE_ORDER: RoadmapStageId[] = [
  "read",
  "map",
  "one_pager",
  "flashcards",
  "question_drill",
  "practiced",
  "judged",
];

const STAGE_LABELS: Record<RoadmapStageId, string> = {
  read: "Read",
  map: "Map",
  one_pager: "One pager",
  flashcards: "Flashcards",
  question_drill: "Question drill",
  practiced: "Practiced",
  judged: "Judged",
};

const TEAM3 = "#C2410C";

type StationKind = "d" | "p" | "o" | "t" | "n";

function stationKind(s: RoadmapStage, today: string): StationKind {
  if (!s.required) return "n";
  if (s.done_at) return "d";
  if (s.due && s.due < today) return "o";
  // In progress: due today or within 2 days with prior stages done
  if (s.due && s.due <= today) return "p";
  return "t";
}

function dotStyle(kind: StationKind, teamColour: string): CSSProperties {
  const base: CSSProperties = {
    display: "block",
    width: 30,
    height: 30,
    borderRadius: "50%",
    boxSizing: "border-box",
  };
  if (kind === "d") return { ...base, background: teamColour };
  if (kind === "p")
    return { ...base, background: "#FFFFFF", border: `7px solid ${teamColour}` };
  if (kind === "o")
    return { ...base, background: "#FFFFFF", border: "4px solid #C62828" };
  if (kind === "n")
    return {
      ...base,
      background: "#F7F8FA",
      border: "2px dashed #C9CCD3",
    };
  return { ...base, background: "#FFFFFF", border: "3px solid #9AA0AA" };
}

function formatDue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function RoadmapPage() {
  const { setMood } = useCruxy();
  const [view, setView] = useState<View | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/revision/roadmap");
      const data = (await res.json()) as View;
      setView(data);
      if ((data.overdueCount ?? 0) > 0) setMood("curious");
    })();
  }, [setMood]);

  const today = new Date().toISOString().slice(0, 10);

  const flags = useMemo(() => {
    const comp = view?.competitionDate ?? "2026-12-05";
    const rows: { label: string; date: string; pct: number; regional?: boolean }[] =
      [
        { label: "Read all", date: "Nov 24", pct: 21.4 },
        { label: "Map", date: "Nov 25", pct: 28.6 },
        { label: "One pagers", date: "Nov 28", pct: 50 },
        { label: "Cards + drills", date: "Dec 2", pct: 78.6 },
        { label: "Practiced", date: "Dec 3", pct: 85.7 },
        { label: "Judged", date: "Dec 4", pct: 92.9 },
        {
          label: "Regional",
          date: formatDue(comp) || "Dec 5",
          pct: 100,
          regional: true,
        },
      ];
    return rows;
  }, [view?.competitionDate]);

  const overall =
    view?.overallReady ??
    (view?.cases.length
      ? Math.round(
          view.cases.reduce((s, c) => s + c.readiness, 0) / view.cases.length,
        )
      : 0);

  const overdue =
    view?.overdueCount ??
    view?.cases.reduce(
      (n, c) =>
        n +
        c.stages.filter(
          (s) => s.required && !s.done_at && s.due && s.due < today,
        ).length,
      0,
    ) ??
    0;

  // Prefer cases with roles / non-zero readiness for the stage board
  const tracks = (view?.cases ?? [])
    .filter((c) => c.stages.some((s) => s.required) || c.readiness > 0)
    .slice(0, 8);

  return (
    <main className="flex flex-col gap-6 animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
            {view?.personName ?? "You"}
            {view?.teamName ? `, ${view.teamName}` : ""}
          </span>
          <h1 className="font-display m-0 text-[56px] font-extrabold leading-[0.95] tracking-[-0.03em]">
            My roadmap
          </h1>
        </div>
        <div className="flex gap-3">
          <div className="rounded-2xl bg-white px-[18px] py-3.5">
            <div className="font-display text-[40px] font-extrabold leading-none">
              {overall}%
            </div>
            <div className="text-[13px] text-muted">ready overall</div>
          </div>
          <div
            className="rounded-2xl bg-white px-[18px] py-3.5"
            style={{ border: overdue ? "2px solid #C62828" : undefined }}
          >
            <div
              className="font-display text-[40px] font-extrabold leading-none"
              style={{ color: overdue ? "#C62828" : undefined }}
            >
              {overdue}
            </div>
            <div className="text-[13px] text-muted">overdue</div>
          </div>
        </div>
      </div>

      <section className="flex flex-col gap-4 rounded-[20px] bg-ink px-6 py-5 text-white">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="m-0 text-[15px] font-bold">
            Recommended deadlines to{" "}
            {formatDue(view?.competitionDate) || "Dec 5"}
          </h2>
          <span className="text-[13px] text-[#9AA0AA]">
            Your team can edit these
          </span>
        </div>
        <div className="relative h-16">
          <div className="absolute left-0 right-0 top-[26px] h-1 rounded-sm bg-[#2A2E38]" />
          {flags.map((f) => (
            <div
              key={f.label}
              className="absolute top-0 flex flex-col"
              style={{
                left: `${f.pct}%`,
                transform: `translateX(-${f.pct > 90 ? 100 : 50}%)`,
                alignItems: f.pct > 90 ? "flex-end" : "center",
              }}
            >
              <span className="whitespace-nowrap text-xs font-bold">
                {f.label}
              </span>
              <span
                className="my-1.5 block h-3 w-3 rounded-full"
                style={{
                  background: f.regional ? "#9D2235" : "#F5B700",
                }}
              />
              <span className="whitespace-nowrap font-mono text-xs font-semibold text-[#9AA0AA]">
                {f.date}
              </span>
            </div>
          ))}
          <div className="absolute bottom-0 left-0 top-0 w-[3px] rounded-sm bg-gold" />
          <span className="absolute left-2 top-11 text-xs font-bold text-gold">
            Today
          </span>
        </div>
      </section>

      <div className="flex flex-wrap items-start gap-6">
        <section className="min-w-0 flex-[999_1_640px] overflow-x-auto rounded-[20px] bg-white py-2">
          <h2 className="font-display m-0 px-6 pb-2 pt-4 text-2xl font-extrabold">
            My cases, stage by stage
          </h2>
          <div className="min-w-[820px]">
            <div className="grid grid-cols-[250px_repeat(7,minmax(0,1fr))] px-6 py-2 text-center text-xs font-bold text-muted">
              <span className="text-left">Case / my role</span>
              {STAGE_ORDER.map((s) => (
                <span key={s}>{STAGE_LABELS[s]}</span>
              ))}
            </div>
            {tracks.length === 0 ? (
              <p className="px-6 py-4 text-sm text-muted">
                Open a case or wait for roles — stages fill as you work. Progress
                is only against your own past.
              </p>
            ) : (
              tracks.map(({ case: c, stages, role, tag, readiness }) => {
                const byId = new Map(stages.map((s) => [s.stage, s]));
                const ordered = STAGE_ORDER.map(
                  (id) =>
                    byId.get(id) ??
                    ({
                      id: `${c.id}-${id}`,
                      person_id: "",
                      case_id: c.id,
                      stage: id,
                      required: false,
                      due: null,
                      done_at: null,
                      created_at: "",
                      created_by: null,
                    } as RoadmapStage),
                );
                const kinds = ordered.map((s) => stationKind(s, today));
                const doneCount = kinds.filter((k) => k === "d").length;
                const fill = doneCount / 7;
                return (
                  <div
                    key={c.id}
                    className="grid grid-cols-[250px_1fr] items-center border-t border-[#ECEEF1] px-6 py-4"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="flex items-baseline gap-2.5">
                        <span className="font-display text-[28px] font-extrabold text-cardinal">
                          {c.number}
                        </span>
                        <span className="text-sm font-semibold">{c.title}</span>
                      </span>
                      <span className="text-[13px] text-muted">
                        {role ?? (readiness ? `${readiness}% ready` : "No role yet")}
                      </span>
                      {tag ? (
                        <span className="text-xs font-semibold text-[#8A6500]">
                          {tag}
                        </span>
                      ) : null}
                    </div>
                    <div className="relative">
                      <div className="absolute left-[7.14%] right-[7.14%] top-[13px] h-1 rounded-sm bg-[#E3E5E9]" />
                      <div
                        className="absolute left-[7.14%] top-[13px] h-1 rounded-sm"
                        style={{
                          background: TEAM3,
                          width: `calc((100% - 14.28%) * ${fill})`,
                        }}
                      />
                      <div className="grid grid-cols-7">
                        {ordered.map((s, i) => {
                          const kind = kinds[i]!;
                          return (
                            <div
                              key={s.stage}
                              className="relative z-[1] flex flex-col items-center gap-2"
                            >
                              <span
                                style={dotStyle(kind, TEAM3)}
                                aria-label={
                                  kind === "d"
                                    ? "done"
                                    : kind === "p"
                                      ? "in progress"
                                      : kind === "o"
                                        ? "overdue"
                                        : kind === "n"
                                          ? "not needed"
                                          : "to do"
                                }
                              />
                              <span
                                className="font-mono text-xs font-semibold"
                                style={{
                                  color:
                                    kind === "o"
                                      ? "#C62828"
                                      : kind === "n"
                                        ? "#9AA0AA"
                                        : "#3B404A",
                                  fontWeight: kind === "n" ? 500 : 600,
                                }}
                              >
                                {kind === "n"
                                  ? "not needed"
                                  : formatDue(s.due) || "—"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="flex flex-wrap gap-[18px] border-t border-[#ECEEF1] px-6 py-3.5 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-3.5 w-3.5 rounded-full"
                style={{ background: TEAM3 }}
              />
              Done
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-3.5 w-3.5 rounded-full border-[4px] border-[#C2410C] bg-white box-border"
              />
              In progress
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-[#9AA0AA] bg-white box-border" />
              To do
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3.5 w-3.5 rounded-full border-[3px] border-[#C62828] bg-white box-border" />
              Overdue
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-dashed border-[#C9CCD3] box-border" />
              Not needed for your role
            </span>
          </div>
        </section>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-3 rounded-[20px] bg-white p-5">
          <h2 className="font-display m-0 text-[22px] font-extrabold">
            Assigned to you
          </h2>
          <div className="flex flex-col gap-2.5 text-sm leading-snug">
            {(view?.assignments?.length
              ? view.assignments
              : (view?.doNext ?? []).map((d) => ({
                  title: d,
                  by: "from your roadmap",
                  due: null as string | null,
                  accent: "normal" as const,
                }))
            ).map((a) => (
              <div
                key={a.title}
                className="rounded-xl p-3"
                style={{
                  background:
                    a.accent === "overdue"
                      ? "#FDECEC"
                      : a.accent === "redo"
                        ? "#FFF7DB"
                        : "#F7F8FA",
                }}
              >
                <strong>{a.title}</strong>
                <br />
                <span className="text-muted">
                  {a.by}
                  {a.due ? `, due ${formatDue(a.due)}` : ""}
                </span>
              </div>
            ))}
            {!view?.assignments?.length && !view?.doNext?.length ? (
              <p className="text-muted">Nothing assigned yet.</p>
            ) : null}
          </div>
        </aside>
      </div>
    </main>
  );
}
