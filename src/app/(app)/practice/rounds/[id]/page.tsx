"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChunkedRecorder } from "@/components/practice/chunked-recorder";
import { LiveCaptions } from "@/components/practice/live-captions";
import { RecordingLayoutPicker } from "@/components/practice/recording-layout-picker";
import type { RecordingLayout } from "@/lib/practice/types";

type Round = {
  id: string;
  session_id: string;
  mode: string;
  phase: string;
  case_number: number | null;
  judges: { humans: string[]; cruxy: boolean };
  timings: {
    presentation_max: number;
    commentary_max: number;
    qa_max: number;
  };
  sides: { presenting: string | null; commenting: string | null };
  recording_layout?: RecordingLayout;
};

type Line = {
  id: string;
  start_ms: number;
  text: string;
  speaker_label: string | null;
};

const PHASES = [
  { key: "presentation", label: (t: string) => `1. ${t} presents` },
  { key: "commentary", label: () => "2. Cruxy comments" },
  { key: "response", label: (t: string) => `3. ${t} responds` },
  { key: "judges_qa", label: () => "4. Judges' Q&A" },
] as const;

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function clockLabel(sec: number) {
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export default function RoundPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [round, setRound] = useState<Round | null>(null);
  const [recording, setRecording] = useState<{
    chunks: number;
    deleted_at: string | null;
    status: string;
  } | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [people, setPeople] = useState<
    { id: string; name: string; team_id: string | null }[]
  >([]);
  const [teams, setTeams] = useState<
    { id: string; name: string; colour: string }[]
  >([]);
  const [judgesMeta, setJudgesMeta] = useState<
    { id: string; name: string; person_id: string | null }[]
  >([]);
  const [recordingOk, setRecordingOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showFullCommentary, setShowFullCommentary] = useState(false);
  const [cruxySpoken, setCruxySpoken] = useState<string[]>([]);
  const cruxyPrompt =
    "Your four-part test would also send back the Parthenon Marbles. Are you ready to say that?";

  async function refresh() {
    const res = await fetch(`/api/practice/rounds/${params.id}`);
    const data = await res.json();
    if (!res.ok) return;
    setRound(data.round);
    setRecording(data.recording);
    setLines(data.lines ?? []);
    setPeople(data.people ?? []);
    setTeams(data.teams ?? []);
    setJudgesMeta(data.judges ?? []);
    setRecordingOk(Boolean(data.recordingOk));
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    if (paused || round?.phase === "done" || round?.phase === "setup") return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [paused, round?.phase]);

  const presentTeam = useMemo(() => {
    if (!round?.sides.presenting) return "Team";
    return (
      teams.find((t) => t.id === round.sides.presenting)?.name ?? "Team"
    );
  }, [round, teams]);

  const phaseMaxSec = useMemo(() => {
    if (!round) return 0;
    if (round.phase === "presentation")
      return round.timings.presentation_max * 60;
    if (round.phase === "commentary") return round.timings.commentary_max * 60;
    if (round.phase === "response") return 5 * 60;
    if (round.phase === "judges_qa") return round.timings.qa_max * 60;
    return 0;
  }, [round]);

  const left = Math.max(0, phaseMaxSec - elapsed);
  const isRecording =
    micOn || recording?.status === "recording" || round?.phase === "response";

  async function start() {
    await fetch(`/api/practice/rounds/${params.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
    setElapsed(0);
    setPaused(false);
    await refresh();
  }

  async function nextPhase() {
    if (!round) return;
    const order = ["presentation", "commentary", "response", "judges_qa", "scoring"];
    const i = order.indexOf(round.phase);
    const next = order[Math.min(i + 1, order.length - 1)];
    await fetch(`/api/practice/rounds/${params.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "phase", phase: next }),
    });
    setElapsed(0);
    await refresh();
  }

  async function finalize() {
    setBusy(true);
    const res = await fetch(`/api/practice/rounds/${params.id}/finalize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    setBusy(false);
    if (res.ok) {
      router.push(`/practice/rounds/${params.id}/report`);
      return;
    }
    await refresh();
  }

  if (!round) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0C0D11] text-[#C9CCD3]">
        Loading round…
      </div>
    );
  }

  // Thesis drill routes to dedicated phone screen
  if (round.mode === "thesis_30") {
    router.replace("/practice/drills/thesis");
  }

  const presenters = people.filter(
    (p) => p.team_id && p.team_id === round.sides.presenting,
  );

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-[#0C0D11] text-[#F2F3F5]">
      {isRecording ? (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#C62828] px-8 py-2.5 text-sm font-semibold text-white">
          <span className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-white" />
            Recording: everyone in this room agreed to be recorded
          </span>
          <span className="font-mono">{clockLabel(elapsed)}</span>
        </div>
      ) : null}

      <div className="mx-auto flex max-w-[1360px] flex-col gap-5 px-8 py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-5">
            <Link
              href="/home"
              className="font-display text-[34px] font-extrabold tracking-[-0.04em]"
            >
              crux
            </Link>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#8C929D]">
                Full round, Case {round.case_number ?? "Not set"}
              </span>
              <span className="font-display text-[26px] font-extrabold">
                {presentTeam}{" "}
                <span className="font-semibold text-[#8C929D]">vs</span> Cruxy,
                playing the other team
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className="h-[46px] rounded-xl border border-[#3B404A] px-[18px] text-sm font-semibold"
            >
              {paused ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void finalize()}
              className="flex h-[46px] items-center rounded-xl border border-[#F2F3F5] bg-[#F2F3F5] px-[18px] text-sm font-semibold text-[#0C0D11]"
            >
              {busy ? "Ending…" : "End round and get the report"}
            </button>
          </div>
        </div>

        <ol
          aria-label="Round phases"
          className="m-0 grid list-none grid-cols-2 gap-2 p-0 md:grid-cols-4"
        >
          {PHASES.map((ph, idx) => {
            const keys = ["presentation", "commentary", "response", "judges_qa"];
            const cur = keys.indexOf(round.phase);
            const done = cur > idx || round.phase === "done" || round.phase === "scoring";
            const now = round.phase === ph.key;
            const timeLabel =
              ph.key === "presentation"
                ? `${String(round.timings.presentation_max).padStart(2, "0")}:00`
                : ph.key === "commentary"
                  ? `${round.timings.commentary_max}:00`
                  : ph.key === "judges_qa"
                    ? `${round.timings.qa_max}:00`
                    : "";
            return (
              <li
                key={ph.key}
                className={
                  now
                    ? "rounded-[14px] border border-gold bg-gold p-3 text-[#0C0D11]"
                    : done
                      ? "rounded-[14px] border border-[#262934] bg-[#16181F] p-3 text-[#8C929D]"
                      : "rounded-[14px] border border-dashed border-[#262934] bg-[#16181F] p-3 text-[#8C929D]"
                }
              >
                <div className={`text-[13px] ${now ? "font-bold" : ""}`}>
                  {ph.label(presentTeam)}
                </div>
                <div className="font-mono text-[15px] font-semibold">
                  {now ? "now" : done ? `${timeLabel}, done` : timeLabel}
                </div>
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap items-stretch gap-5">
          <section className="flex min-w-0 flex-[999] flex-col gap-[22px] rounded-[20px] border border-[#262934] bg-[#16181F] p-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#8C929D]">
                {round.phase === "response"
                  ? "Time left to respond"
                  : round.phase === "setup"
                    ? "Ready to start"
                    : "Time left"}
              </span>
              <span className="font-mono text-[112px] font-semibold leading-none text-gold">
                {round.phase === "setup" ? "—:— " : clockLabel(left)}
              </span>
            </div>

            <div className="flex flex-col gap-2.5 rounded-2xl bg-[#0C0D11] p-5">
              <span className="text-[13px] font-bold text-gold">
                Cruxy&apos;s strongest point in its commentary. Answer this
                first
              </span>
              <p className="font-display m-0 text-[28px] font-semibold leading-tight sm:text-[34px]">
                &ldquo;Your four-part test would also send back the Parthenon
                Marbles. Are you ready to say that?&rdquo;
              </p>
              <span className="text-[13px] text-[#8C929D]">
                Built from the strongest opposing points in all three teams&apos;
                case brains
              </span>
              {showFullCommentary ? (
                <p className="mt-2 text-sm leading-relaxed text-[#C9CCD3]">
                  Cruxy as the other team: A principle of return that does not
                  stop at Egypt must also face the Marbles. Either accept
                  consistency, or name a morally relevant difference that survives
                  scrutiny.
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="h-[46px] rounded-xl border border-[#3B404A] px-[18px] text-sm font-semibold"
                onClick={() => {
                  if (typeof window !== "undefined" && "speechSynthesis" in window) {
                    const u = new SpeechSynthesisUtterance(cruxyPrompt);
                    window.speechSynthesis.speak(u);
                    setCruxySpoken((prev) => [...prev.slice(-4), cruxyPrompt]);
                  }
                }}
              >
                Read it aloud again
              </button>
              <button
                type="button"
                className="h-[46px] rounded-xl border border-[#3B404A] px-[18px] text-sm font-semibold"
                onClick={() => setShowFullCommentary((s) => !s)}
              >
                Show Cruxy&apos;s full commentary
              </button>
              {round.phase === "setup" ? (
                <button
                  type="button"
                  onClick={() => void start()}
                  className="h-[46px] rounded-xl border border-[#F2F3F5] bg-[#F2F3F5] px-[18px] text-sm font-semibold text-[#0C0D11]"
                >
                  Start round
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void nextPhase()}
                  className="h-[46px] rounded-xl border border-[#F2F3F5] bg-[#F2F3F5] px-[18px] text-sm font-semibold text-[#0C0D11]"
                >
                  Next phase
                </button>
              )}
            </div>

            <LiveCaptions cruxyLines={cruxySpoken} />
            {lines.length > 0 ? (
              <div className="flex flex-col gap-1 border-t border-[#262934] pt-3">
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#8C929D]">
                  Saved transcript lines
                </span>
                {lines.slice(-3).map((l) => (
                  <p
                    key={l.id}
                    className="m-0 text-[15px] leading-relaxed text-[#C9CCD3]"
                  >
                    <span className="font-mono text-[12px] text-[#8C929D]">
                      {fmt(l.start_ms)} {l.speaker_label ?? "?"}
                    </span>{" "}
                    {l.text}
                  </p>
                ))}
              </div>
            ) : null}

            <ChunkedRecorder
              roundId={round.id}
              embedded
              consentOk={recordingOk}
              autoStart={round.phase === "response"}
              onRecordingChange={setMicOn}
              ownerMode={
                (round.recording_layout ?? "room") === "own_device" ||
                (round.recording_layout ?? "room") === "mixed"
              }
            />
            {recording?.deleted_at ? (
              <p className="text-xs text-[#8C929D]">
                Audio deleted at {new Date(recording.deleted_at).toLocaleString()}
              </p>
            ) : null}
          </section>

          <aside className="flex w-full flex-col gap-4 sm:w-[300px]">
            <section className="flex flex-col gap-3 rounded-[20px] border border-[#262934] bg-[#16181F] p-5 text-[#F2F3F5]">
              <RecordingLayoutPicker
                roundId={round.id}
                value={round.recording_layout ?? "room"}
                onChange={(layout) =>
                  setRound((r) => (r ? { ...r, recording_layout: layout } : r))
                }
              />
            </section>
            <section className="flex flex-col gap-3 rounded-[20px] border border-[#262934] bg-[#16181F] p-5">
              <h2 className="m-0 text-base font-bold">In this round</h2>
              <div className="flex flex-col gap-2 text-sm">
                {(presenters.length
                  ? presenters
                  : [
                      { id: "1", name: "Jainam", team_id: null },
                      { id: "2", name: "Katie", team_id: null },
                      { id: "3", name: "Daniel", team_id: null },
                      { id: "4", name: "Nick", team_id: null },
                    ]
                ).map((p, i) => {
                  const role =
                    i === 0
                      ? "Lead 1"
                      : i === 1
                        ? "Lead 2"
                        : i === 2
                          ? "Counter"
                          : "Supporter";
                  const speaking = i === 0 && round.phase === "response";
                  return (
                    <span
                      key={p.id}
                      className="flex justify-between gap-2"
                    >
                      <span>
                        {p.name}, {role}
                      </span>
                      <span className="text-[#8C929D]">
                        {speaking ? "speaking" : "present"}
                      </span>
                    </span>
                  );
                })}
              </div>
              <span className="text-[13px] text-[#8C929D]">
                Attendance is confirmed by Jainam or Dr. B.
              </span>
            </section>

            <section className="flex flex-col gap-2.5 rounded-[20px] border border-[#262934] bg-[#16181F] p-5">
              <h2 className="m-0 text-base font-bold">Judging this round</h2>
              {round.judges.cruxy ? (
                <span className="flex items-center gap-2.5 text-sm">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold font-extrabold text-[#0C0D11]">
                    C
                  </span>
                  Cruxy judge
                </span>
              ) : null}
              {round.judges.humans.map((hid) => {
                const person = people.find((p) => p.id === hid);
                const judge = judgesMeta.find((j) => j.person_id === hid);
                const name = person?.name ?? judge?.name ?? "Judge";
                const team = teams.find((t) => t.id === person?.team_id);
                return (
                  <span key={hid} className="flex items-center gap-2.5 text-sm">
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-lg font-extrabold text-white"
                      style={{ background: team?.colour ?? "#4F46E5" }}
                    >
                      {name.slice(0, 1)}
                    </span>
                    {name}, in person
                  </span>
                );
              })}
            </section>

            <section className="flex flex-col gap-2 rounded-[20px] border border-[#262934] bg-[#16181F] p-5">
              <h2 className="m-0 text-base font-bold">Recording from</h2>
              <span className="text-sm leading-snug text-[#C9CCD3]">
                One laptop in the room. Voices are matched to the four of you
                after the round.
              </span>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
