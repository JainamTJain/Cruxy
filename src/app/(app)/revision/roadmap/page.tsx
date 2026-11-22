"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useCruxy } from "@/components/cruxy/cruxy-context";
import { emitMood } from "@/components/cruxy/mood/bus";
import { LoadingGenie } from "@/components/cruxy/mood/loading-genie";
import { SkeletonBlock } from "@/components/motion/skeleton";
import type { RoadmapStage, RoadmapStageId } from "@/lib/revision/types";
import type { CaseRow } from "@/lib/types";
import { appToday } from "@/lib/time/app-day";

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
  teamColour?: string | null;
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
  read: "Read the case",
  map: "Build the claim map",
  one_pager: "Finish the one pager",
  flashcards: "Learn the flashcards",
  question_drill: "Drill judge questions",
  practiced: "Practice the round",
  judged: "Get judged",
};

const STAGE_HREF: Partial<Record<RoadmapStageId, string>> = {
  read: "/library",
  map: "/case-brain",
  one_pager: "/revision/one-pagers",
  flashcards: "/revision/flashcards",
  question_drill: "/revision/questions",
  practiced: "/practice",
  judged: "/practice",
};

function formatDue(iso: string | null | undefined): string {
  if (!iso) return "No date yet";
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysUntil(iso: string): number {
  const end = new Date(iso + "T12:00:00Z").getTime();
  const now = Date.now();
  return Math.ceil((end - now) / (24 * 60 * 60 * 1000));
}

function todayPct(competitionDate: string, startIso: string): number {
  const start = new Date(startIso + "T12:00:00Z").getTime();
  const end = new Date(competitionDate + "T12:00:00Z").getTime();
  const span = Math.max(end - start, 1);
  return Math.min(100, Math.max(0, ((Date.now() - start) / span) * 100));
}

function stagePct(
  due: string,
  competitionDate: string,
  startIso: string,
): number {
  const start = new Date(startIso + "T12:00:00Z").getTime();
  const end = new Date(competitionDate + "T12:00:00Z").getTime();
  const t = new Date(due + "T12:00:00Z").getTime();
  const span = Math.max(end - start, 1);
  return Math.min(100, Math.max(0, ((t - start) / span) * 100));
}

function statusLabel(
  s: RoadmapStage,
  today: string,
  detail?: StageStatus,
): { text: string; tone: "done" | "overdue" | "today" | "open" | "skip" } {
  if (!s.required) return { text: "Not required", tone: "skip" };
  if (s.done_at) return { text: "Done", tone: "done" };
  if (detail?.notStarted) return { text: "Not started", tone: "open" };
  if (s.due && s.due < today) return { text: "Overdue", tone: "overdue" };
  if (s.due && s.due === today) return { text: "Due today", tone: "today" };
  return { text: "Up next", tone: "open" };
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
  const [caseId, setCaseId] = useState<string>("");
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
    setCaseId((prev) => prev || data.cases[0]?.case.id || "");
    if ((data.overdueCount ?? 0) > 0) setMood("curious");
  }, [setMood]);

  useEffect(() => {
    void load();
  }, [load]);

  const today = appToday();

  const activeCase = useMemo(() => {
    if (!view) return null;
    return (
      view.cases.find((c) => c.case.id === caseId) ?? view.cases[0] ?? null
    );
  }, [view, caseId]);

  const nextAction = useMemo(() => {
    if (!activeCase) return null;
    for (const id of STAGE_ORDER) {
      const s = activeCase.stages.find((x) => x.stage === id);
      if (!s || !s.required || s.done_at) continue;
      return { stage: id, row: s };
    }
    return null;
  }, [activeCase]);

  if (!view) {
    return (
      <div className="flex flex-col gap-4 animate-fade-up">
        <LoadingGenie label="Loading roadmap..." />
        <SkeletonBlock lines={5} className="max-w-xl" />
      </div>
    );
  }

  const overall = view.overallReady ?? 0;
  const overdue = view.overdueCount ?? 0;
  const days = daysUntil(view.competitionDate);
  const startIso = view.deadlines.read || "2026-11-24";
  const teamColour = view.teamColour || "#C2410C";
  const progressNow = todayPct(view.competitionDate, startIso);

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
    <div className="flex flex-col gap-5 animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
            {view.personName ?? "You"}
            {view.teamName ? `, ${view.teamName}` : ""}
          </span>
          <h1 className="font-display m-0 text-[40px] font-extrabold leading-none tracking-[-0.02em] max-md:text-[32px]">
            My roadmap
          </h1>
          <p className="m-0 max-w-xl text-sm text-muted">
            One timeline to the California Regional on{" "}
            {formatDue(view.competitionDate)}. Stages as rows: due date, status,
            and what to do next.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="rounded-2xl bg-white px-4 py-3">
            <div className="font-display text-[32px] font-extrabold leading-none">
              {days < 0 ? 0 : days}
            </div>
            <div className="text-[12px] text-muted">
              {days === 1 ? "day to Dec 5" : "days to Dec 5"}
            </div>
          </div>
          <div className="rounded-2xl bg-white px-4 py-3">
            <div className="font-display text-[32px] font-extrabold leading-none">
              {overall}%
            </div>
            <div className="text-[12px] text-muted">ready</div>
          </div>
          {overdue > 0 ? (
            <div className="rounded-2xl bg-[#FDECEC] px-4 py-3">
              <div className="font-display text-[32px] font-extrabold leading-none text-[#C62828]">
                {overdue}
              </div>
              <div className="text-[12px] text-[#C62828]">overdue</div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Timeline to Dec 5 */}
      <section className="rounded-[20px] bg-ink px-4 py-4 text-white">
        <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.1em] text-white/70">
          <span>Today</span>
          <span>Dec 5 regional</span>
        </div>
        <div className="relative h-3 rounded-full bg-white/15">
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${progressNow}%`,
              background: teamColour,
            }}
          />
          {STAGE_ORDER.map((id) => {
            const due = view.deadlines[id];
            if (!due) return null;
            const pct = stagePct(due, view.competitionDate, startIso);
            return (
              <span
                key={id}
                title={`${STAGE_LABELS[id]}, ${formatDue(due)}`}
                className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-white"
                style={{ left: `${pct}%` }}
              />
            );
          })}
          <span
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
            style={{ left: `${progressNow}%`, background: teamColour }}
            title="Today"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/75">
          {STAGE_ORDER.map((id) => (
            <span key={id}>
              {STAGE_LABELS[id].split(" ").slice(0, 2).join(" ")}{" "}
              {formatDue(view.deadlines[id])}
            </span>
          ))}
        </div>
      </section>

      {saveMsg ? <p className="m-0 text-sm text-muted">{saveMsg}</p> : null}

      {/* Next action */}
      {nextAction ? (
        <section className="rounded-[20px] bg-white p-4">
          <p className="m-0 text-xs font-bold uppercase tracking-[0.12em] text-muted">
            One next action
          </p>
          <h2 className="font-display m-0 mt-1 text-[22px] font-extrabold">
            {STAGE_LABELS[nextAction.stage]}
          </h2>
          <p className="mt-1 text-sm text-muted">
            Due {formatDue(nextAction.row.due)}
            {activeCase
              ? `, Case ${activeCase.case.number}: ${activeCase.case.title}`
              : ""}
          </p>
          {STAGE_HREF[nextAction.stage] ? (
            <Link
              href={
                nextAction.stage === "map" && activeCase
                  ? `/case-brain/${activeCase.case.id}`
                  : STAGE_HREF[nextAction.stage]!
              }
              className="mt-3 inline-flex h-10 items-center rounded-xl bg-cardinal px-4 text-sm font-semibold text-white"
            >
              Go do it
            </Link>
          ) : null}
        </section>
      ) : (
        <section className="rounded-[20px] bg-white p-4 text-sm text-muted">
          Required stages for this case are done. Keep drilling or help a
          teammate.
        </section>
      )}

      {/* Case picker */}
      <label className="text-xs font-semibold text-muted">
        Case
        <select
          className="mt-1 block h-10 w-full max-w-md rounded-xl border border-mist bg-white px-3 text-sm text-ink"
          value={activeCase?.case.id ?? ""}
          onChange={(e) => setCaseId(e.target.value)}
        >
          {view.cases.map((c) => (
            <option key={c.case.id} value={c.case.id}>
              {c.case.number}. {c.case.title}
              {c.role ? ` (${c.role})` : ""}
            </option>
          ))}
        </select>
      </label>

      {/* Stage rows */}
      {activeCase ? (
        <section className="overflow-hidden rounded-[20px] bg-white">
          <div className="border-b border-[#ECEEF1] px-4 py-3">
            <h2 className="font-display m-0 text-lg font-extrabold">
              Case {activeCase.case.number}: {activeCase.case.title}
            </h2>
            <p className="m-0 text-sm text-muted">
              {activeCase.readiness}% ready
              {activeCase.role ? `, ${activeCase.role}` : ""}
            </p>
          </div>
          <ul className="m-0 list-none divide-y divide-[#ECEEF1] p-0">
            {STAGE_ORDER.map((id) => {
              const s = activeCase.stages.find((x) => x.stage === id);
              if (!s) return null;
              const detail = activeCase.statusByStage?.[id];
              const st = statusLabel(s, today, detail);
              const toneClass =
                st.tone === "done"
                  ? "text-[#0F7B6C]"
                  : st.tone === "overdue"
                    ? "text-[#C62828]"
                    : st.tone === "today"
                      ? "text-[#C2410C]"
                      : "text-muted";
              return (
                <li
                  key={id}
                  className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-sm font-semibold text-ink">
                      {STAGE_LABELS[id]}
                    </p>
                    {detail?.detail ? (
                      <p className="m-0 mt-0.5 text-[12px] text-muted">
                        {detail.detail}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="text-muted">Due {formatDue(s.due)}</span>
                    <span className={`font-semibold ${toneClass}`}>
                      {st.text}
                    </span>
                    {!s.done_at && s.required && STAGE_HREF[id] ? (
                      <Link
                        href={
                          id === "map"
                            ? `/case-brain/${activeCase.case.id}`
                            : STAGE_HREF[id]!
                        }
                        className="font-semibold text-cardinal underline"
                      >
                        Open
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Do next from server */}
      {view.doNext.length > 0 ? (
        <section className="rounded-[20px] bg-white p-4">
          <h2 className="font-display m-0 text-lg font-extrabold">Also coming up</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            {view.doNext.slice(0, 5).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Team deadline edit */}
      {view.teamDeadlinesEditable ? (
        <section className="rounded-[20px] bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display m-0 text-lg font-extrabold">
              Team due dates
            </h2>
            <button
              type="button"
              className="text-sm font-semibold text-cardinal underline"
              onClick={() => setEditing((e) => !e)}
            >
              {editing ? "Cancel" : "Edit"}
            </button>
          </div>
          {editing ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {STAGE_ORDER.map((id) => (
                <label key={id} className="text-xs font-semibold text-muted">
                  {STAGE_LABELS[id]}
                  <input
                    type="date"
                    className="mt-1 block h-10 w-full rounded-xl border border-mist px-3 text-sm text-ink"
                    value={draftDues[id] ?? ""}
                    onChange={(e) =>
                      setDraftDues((d) => ({ ...d, [id]: e.target.value }))
                    }
                  />
                </label>
              ))}
              <button
                type="button"
                className="mt-2 h-10 rounded-xl bg-ink px-4 text-sm font-semibold text-white sm:col-span-2 sm:w-fit"
                onClick={() => void saveDeadlines()}
              >
                Save for the team
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
