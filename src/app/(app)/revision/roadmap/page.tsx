"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useCruxy } from "@/components/cruxy/cruxy-context";
import { emitMood } from "@/components/cruxy/mood/bus";
import { LoadingGenie } from "@/components/cruxy/mood/loading-genie";
import { SkeletonBlock } from "@/components/motion/skeleton";
import type { RoadmapStage, RoadmapStageId } from "@/lib/revision/types";
import type { CaseRow } from "@/lib/types";

type StageStatus = {
  stage: RoadmapStageId;
  done: boolean;
  notStarted: boolean;
  detail: string;
};

type View = {
  cases: {
    case: CaseRow;
    stages: RoadmapStage[];
    readiness: number;
    role?: string;
    tag?: string;
    statusByStage?: Record<RoadmapStageId, StageStatus>;
  }[];
  doNext: string[];
  competitionDate: string;
  deadlines: Record<RoadmapStageId, string>;
  teamDeadlinesEditable: boolean;
  teamId: string | null;
  teamReadiness: number | null;
  teamReadinessByCase: { caseId: string; pct: number }[];
  assignments?: {
    title: string;
    by: string;
    due: string | null;
    overdue?: boolean;
    accent?: "overdue" | "redo" | "normal";
  }[];
  personName?: string;
  teamName?: string | null;
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

type StationKind = "d" | "p" | "o" | "t" | "n" | "ns";

function stationKind(s: RoadmapStage, today: string, notStarted?: boolean): StationKind {
  if (!s.required) return "n";
  if (s.done_at) return "d";
  if (notStarted) return "ns";
  if (s.due && s.due < today) return "o";
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
  if (kind === "ns")
    return {
      ...base,
      background: "#F7F8FA",
      border: "2px solid #C9CCD3",
    };
  if (kind === "n")
    return {
      ...base,
      background: "#F7F8FA",
      border: "2px dashed #C9CCD3",
    };
  return { ...base, background: "#FFFFFF", border: "3px solid #9AA0AA" };
}

function formatDue(iso: string | null | undefined): string {
  if (!iso) return "Not set";
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function deadlinePct(
  deadlines: Record<RoadmapStageId, string>,
  competitionDate: string,
  stage: RoadmapStageId | "regional",
): number {
  const start = new Date(
    (deadlines.read || "2026-11-24") + "T12:00:00Z",
  ).getTime();
  const end = new Date(competitionDate + "T12:00:00Z").getTime();
  const span = Math.max(end - start, 1);
  if (stage === "regional") return 100;
  const t = new Date((deadlines[stage] || competitionDate) + "T12:00:00Z").getTime();
  return Math.min(100, Math.max(0, ((t - start) / span) * 100));
}

function doneStageKeys(data: View): string[] {
  const keys: string[] = [];
  for (const c of data.cases) {
    for (const s of c.stages) {
      if (s.done_at) keys.push(`${c.case.id}:${s.stage}`);
    }
  }
  return keys;
}

export default function RoadmapPage() {
  const { setMood } = useCruxy();
  const [view, setView] = useState<View | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftDues, setDraftDues] = useState<Record<RoadmapStageId, string>>(
    {} as Record<RoadmapStageId, string>,
  );
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const prevDone = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/roadmap");
    if (!res.ok) {
      setSaveMsg("Could not load roadmap.");
      return;
    }
    const data = (await res.json()) as View;
    const nowDone = new Set(doneStageKeys(data));
    if (prevDone.current) {
      for (const key of nowDone) {
        if (!prevDone.current.has(key)) {
          const stage = key.split(":")[1] ?? "Stage";
          emitMood({
            type: "roadmap.stage_done",
            stage: STAGE_LABELS[stage as RoadmapStageId] ?? stage,
          });
          break;
        }
      }
    }
    prevDone.current = nowDone;
    setView(data);
    setDraftDues(data.deadlines);
    if ((data.overdueCount ?? 0) > 0) setMood("curious");
  }, [setMood]);

  useEffect(() => {
    void load();
  }, [load]);

  const today = new Date().toISOString().slice(0, 10);

  const flags = useMemo(() => {
    if (!view?.deadlines) return [];
    const rows: {
      label: string;
      stage: RoadmapStageId | "regional";
      date: string;
      pct: number;
      regional?: boolean;
    }[] = [
      {
        label: "Read all",
        stage: "read",
        date: formatDue(view.deadlines.read),
        pct: deadlinePct(view.deadlines, view.competitionDate, "read"),
      },
      {
        label: "Map",
        stage: "map",
        date: formatDue(view.deadlines.map),
        pct: deadlinePct(view.deadlines, view.competitionDate, "map"),
      },
      {
        label: "One pagers",
        stage: "one_pager",
        date: formatDue(view.deadlines.one_pager),
        pct: deadlinePct(view.deadlines, view.competitionDate, "one_pager"),
      },
      {
        label: "Cards + drills",
        stage: "flashcards",
        date: formatDue(view.deadlines.flashcards),
        pct: deadlinePct(view.deadlines, view.competitionDate, "flashcards"),
      },
      {
        label: "Practiced",
        stage: "practiced",
        date: formatDue(view.deadlines.practiced),
        pct: deadlinePct(view.deadlines, view.competitionDate, "practiced"),
      },
      {
        label: "Judged",
        stage: "judged",
        date: formatDue(view.deadlines.judged),
        pct: deadlinePct(view.deadlines, view.competitionDate, "judged"),
      },
      {
        label: "Regional",
        stage: "regional",
        date: formatDue(view.competitionDate) || "Dec 5",
        pct: 100,
        regional: true,
      },
    ];
    return rows;
  }, [view]);

  if (!view) {
    return (
      <main className="flex flex-col gap-4 animate-fade-up">
        <LoadingGenie label="Loading roadmap..." />
        <SkeletonBlock lines={5} className="max-w-xl" />
      </main>
    );
  }

  const overall = view.overallReady ?? 0;
  const overdue = view?.overdueCount ?? 0;

  const tracks = view.cases.filter(
    (c) => c.stages.some((s) => s.required) || c.readiness > 0,
  );

  async function saveDeadlines() {
    if (!view?.teamId) return;
    setSaveMsg("Saving…");
    const res = await fetch("/api/roadmap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "set_deadlines",
        teamId: view.teamId,
        dues: draftDues,
      }),
    });
    if (!res.ok) {
      setSaveMsg("Could not save deadlines.");
      return;
    }
    setEditing(false);
    setSaveMsg("Deadlines saved for your team.");
    await load();
  }

  return (
    <main className="flex flex-col gap-6 animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
            {view?.personName ?? "You"}
            {view?.teamName ? `, ${view.teamName}` : ""}
          </span>
          <h1 className="font-display m-0 text-[56px] font-extrabold leading-[0.95] tracking-[-0.03em] max-md:text-[36px]">
            My roadmap
          </h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="rounded-2xl bg-white px-[18px] py-3.5">
            <div className="font-display text-[40px] font-extrabold leading-none">
              {overall}%
            </div>
            <div className="text-[13px] text-muted">ready (you)</div>
          </div>
          <div className="rounded-2xl bg-white px-[18px] py-3.5">
            <div className="font-display text-[40px] font-extrabold leading-none">
              {view?.teamReadiness == null ? "Not set" : `${view.teamReadiness}%`}
            </div>
            <div className="text-[13px] text-muted">ready (team)</div>
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

      {saveMsg ? <p className="text-sm text-muted">{saveMsg}</p> : null}

      <section className="flex flex-col gap-4 rounded-[20px] bg-ink px-6 py-5 text-white">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="m-0 text-[15px] font-bold">
            Recommended deadlines to{" "}
            {formatDue(view?.competitionDate) || "Dec 5"}
          </h2>
          {view?.teamDeadlinesEditable ? (
            <button
              type="button"
              className="text-[13px] font-semibold text-gold underline"
              onClick={() => {
                setEditing((e) => !e);
                if (view?.deadlines) setDraftDues(view.deadlines);
              }}
            >
              {editing ? "Cancel" : "Edit for your team"}
            </button>
          ) : (
            <span className="text-[13px] text-[#9AA0AA]">
              Your team can edit these
            </span>
          )}
        </div>

        {editing ? (
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
            {STAGE_ORDER.map((stage) => (
              <label key={stage} className="text-xs font-semibold text-[#9AA0AA]">
                {STAGE_LABELS[stage]}
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-[#2A2E38] bg-[#111318] px-2 py-2 text-sm text-white"
                  value={draftDues[stage] ?? ""}
                  onChange={(e) =>
                    setDraftDues((d) => ({ ...d, [stage]: e.target.value }))
                  }
                />
              </label>
            ))}
            <button
              type="button"
              className="mt-4 h-10 rounded-xl bg-gold px-4 text-sm font-bold text-ink"
              onClick={() => void saveDeadlines()}
            >
              Save team deadlines
            </button>
          </div>
        ) : (
          <div className="relative h-16 max-md:h-auto max-md:space-y-2">
            <div className="absolute left-0 right-0 top-[26px] h-1 rounded-sm bg-[#2A2E38] max-md:hidden" />
            <div className="max-md:flex max-md:flex-wrap max-md:gap-3 md:contents">
              {flags.map((f) => (
                <div
                  key={f.label}
                  className="absolute top-0 flex flex-col max-md:static max-md:translate-x-0"
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
                    className="my-1.5 block h-3 w-3 rounded-full max-md:hidden"
                    style={{
                      background: f.regional ? "#9D2235" : "#F5B700",
                    }}
                  />
                  <span className="whitespace-nowrap font-mono text-xs font-semibold text-[#9AA0AA]">
                    {f.date}
                  </span>
                </div>
              ))}
            </div>
            <div className="absolute bottom-0 left-0 top-0 w-[3px] rounded-sm bg-gold max-md:hidden" />
            <span className="absolute left-2 top-11 text-xs font-bold text-gold max-md:static">
              Today
            </span>
          </div>
        )}
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
                No roles or activity yet. Stages stay Not started until real
                reading, map work, cards, answers, rounds or judge cards show
                up. Progress is only against your own past.
              </p>
            ) : (
              tracks.map(({ case: c, stages, role, tag, readiness, statusByStage }) => {
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
                const kinds = ordered.map((s) =>
                  stationKind(s, today, statusByStage?.[s.stage]?.notStarted),
                );
                const doneCount = kinds.filter((k) => k === "d").length;
                const fill = doneCount / 7;
                const teamPct = view?.teamReadinessByCase?.find(
                  (t) => t.caseId === c.id,
                )?.pct;
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
                        {role ?? "No role yet"}
                        {`, ${readiness}% you`}
                        {teamPct != null ? `, ${teamPct}% team` : ""}
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
                          const status = statusByStage?.[s.stage];
                          return (
                            <div
                              key={s.stage}
                              className="relative z-[1] flex flex-col items-center gap-2"
                              title={status?.detail ?? STAGE_LABELS[s.stage]}
                            >
                              <span
                                style={dotStyle(kind, TEAM3)}
                                aria-label={
                                  kind === "d"
                                    ? "done"
                                    : kind === "ns"
                                      ? "not started"
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
                                      : kind === "n" || kind === "ns"
                                        ? "#9AA0AA"
                                        : "#3B404A",
                                  fontWeight: kind === "n" ? 500 : 600,
                                }}
                              >
                                {kind === "n"
                                  ? "not needed"
                                  : kind === "ns"
                                    ? "Not started"
                                    : formatDue(s.due)}
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
              <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-[#C9CCD3] bg-[#F7F8FA] box-border" />
              Not started
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3.5 w-3.5 rounded-full border-[4px] border-[#C2410C] bg-white box-border" />
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
            Do next
          </h2>
          <div className="flex flex-col gap-2.5 text-sm leading-snug">
            {(view?.doNext ?? []).map((d) => (
              <div key={d} className="rounded-xl bg-[#F7F8FA] p-3">
                <strong>{d}</strong>
              </div>
            ))}
            {!view?.doNext?.length ? (
              <p className="text-muted">
                Nothing queued. When a stage is overdue, feedback is weak, or
                someone assigns you work, it shows up here.
              </p>
            ) : null}
          </div>

          <h2 className="font-display m-0 mt-4 text-[22px] font-extrabold">
            Assigned to you
          </h2>
          <div className="flex flex-col gap-2.5 text-sm leading-snug">
            {(view?.assignments ?? []).map((a) => (
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
            {!view?.assignments?.length ? (
              <p className="text-muted">Nothing assigned yet.</p>
            ) : null}
          </div>
        </aside>
      </div>
    </main>
  );
}
