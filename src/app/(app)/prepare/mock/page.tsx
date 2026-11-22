"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChunkedRecorder } from "@/components/practice/chunked-recorder";
import { DrillShell } from "@/components/practice/drill-shell";
import { speakText, stopSpeaking } from "@/lib/practice/speech";
import type { AppeItemKey, CardScore, FeedbackItem, JudgeCard } from "@/lib/practice/types";

type Phase =
  | "boot"
  | "moderator"
  | "presentation"
  | "commentary"
  | "response"
  | "judges"
  | "scoring"
  | "done";

type MockStart = {
  sessionId: string;
  roundId: string;
  caseId: string | null;
  caseNumber: number | null;
  caseTitle: string | null;
  teamId: string | null;
  recordingOk: boolean;
  moderatorQuestion: string | null;
  timings: {
    presentation: number;
    commentary: number;
    response: number;
    judges: number;
  };
};

function clock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function SoloMockPage() {
  const [phase, setPhase] = useState<Phase>("boot");
  const [start, setStart] = useState<MockStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [recording, setRecording] = useState(false);
  const [commentary, setCommentary] = useState<string | null>(null);
  const [questions, setQuestions] = useState<{ kind: string; text: string }[]>(
    [],
  );
  const [qIndex, setQIndex] = useState(0);
  const [notes, setNotes] = useState("");
  const [scores, setScores] = useState<CardScore[]>([]);
  const [cards, setCards] = useState<JudgeCard[]>([]);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const caseId =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("caseId")
          : null;
      setBusy(true);
      try {
        const res = await fetch("/api/prepare/mock", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "start", caseId }),
        });
        const data = (await res.json()) as MockStart & { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Could not start solo mock.");
          return;
        }
        setStart(data);
        setPhase("moderator");
        if (data.moderatorQuestion) {
          speakText(data.moderatorQuestion);
        }
      } catch {
        setError("Could not start solo mock.");
      } finally {
        setBusy(false);
      }
    })();
    return () => stopSpeaking();
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          setRunning(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const eyebrow = useMemo(() => {
    const n = start?.caseNumber != null ? `, CASE ${start.caseNumber}` : "";
    return `SOLO MOCK${n}`;
  }, [start?.caseNumber]);

  function beginTimed(next: Phase, secs: number) {
    stopSpeaking();
    setPhase(next);
    setSeconds(secs);
    setRunning(true);
  }

  async function loadCommentary() {
    if (!start) return;
    setBusy(true);
    setPhase("commentary");
    try {
      const res = await fetch("/api/prepare/mock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "commentary",
          caseId: start.caseId,
          caseTitle: start.caseTitle,
          caseNumber: start.caseNumber,
          presentationNotes: notes,
        }),
      });
      const data = (await res.json()) as {
        commentary?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not load commentary.");
        return;
      }
      setCommentary(data.commentary ?? null);
      if (data.commentary) speakText(data.commentary.slice(0, 700));
      setSeconds(start.timings.commentary);
      setRunning(true);
    } finally {
      setBusy(false);
    }
  }

  async function loadJudges() {
    if (!start) return;
    setBusy(true);
    setPhase("judges");
    try {
      const res = await fetch("/api/prepare/mock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "judges",
          caseId: start.caseId,
          caseTitle: start.caseTitle,
        }),
      });
      const data = (await res.json()) as {
        questions?: { kind: string; text: string }[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not load judges.");
        return;
      }
      const qs = data.questions ?? [];
      setQuestions(qs);
      setQIndex(0);
      if (qs[0]?.text) speakText(qs[0].text);
      setSeconds(start.timings.judges);
      setRunning(true);
    } finally {
      setBusy(false);
    }
  }

  async function finishScoring() {
    if (!start) return;
    setBusy(true);
    setPhase("scoring");
    setRunning(false);
    stopSpeaking();
    try {
      const res = await fetch("/api/prepare/mock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "score",
          roundId: start.roundId,
          fallbackNotes: notes,
        }),
      });
      const data = (await res.json()) as {
        cards?: JudgeCard[];
        scores?: CardScore[];
        feedback?: FeedbackItem[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not score.");
        return;
      }
      setCards(data.cards ?? []);
      setScores(data.scores ?? []);
      setFeedback(data.feedback ?? []);
      setPhase("done");
    } finally {
      setBusy(false);
    }
  }

  const scoreByItem = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of scores) {
      map.set(s.item, s.score);
    }
    return map;
  }, [scores]);

  return (
    <DrillShell
      eyebrow={eyebrow}
      subtitle="Cruxy plays the other team, the moderator, and the judges. APPE timings."
      recording={recording}
      footer={
        <Link href="/prepare" className="text-center text-xs text-[#8C929D]">
          Back to my part
        </Link>
      }
    >
      {busy && phase === "boot" ? (
        <p className="text-sm text-[#8C929D]">Opening your solo mock…</p>
      ) : null}
      {error ? <p className="text-sm text-[#C62828]">{error}</p> : null}

      {phase === "moderator" && start ? (
        <>
          <p className="text-xs font-bold tracking-[0.08em] text-gold">
            CRUXY AS MODERATOR
          </p>
          <p className="font-display m-0 text-[24px] font-semibold leading-tight">
            &ldquo;
            {start.moderatorQuestion ??
              "What should the team do, and why is that the right call?"}
            &rdquo;
          </p>
          <button
            type="button"
            className="h-[46px] rounded-xl bg-[#F2F3F5] px-4 text-sm font-semibold text-[#0C0D11]"
            onClick={() =>
              beginTimed("presentation", start.timings.presentation)
            }
          >
            Start my presentation ({Math.round(start.timings.presentation / 60)}{" "}
            min)
          </button>
        </>
      ) : null}

      {phase === "presentation" && start ? (
        <>
          <span className="font-mono text-[64px] font-semibold text-gold">
            {clock(seconds)}
          </span>
          <p className="m-0 text-sm text-[#8C929D]">
            Present as your team. APPE allows 7 to 12 minutes.
          </p>
          <textarea
            className="min-h-[72px] rounded-2xl border border-[#3B404A] bg-[#16181F] p-3 text-sm text-[#F2F3F5]"
            placeholder="Optional notes for Cruxy's commentary (if you are not recording)."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {start.roundId ? (
            <ChunkedRecorder
              roundId={start.roundId}
              embedded
              consentOk={start.recordingOk}
              onRecordingChange={setRecording}
            />
          ) : null}
          <button
            type="button"
            className="h-[46px] rounded-xl bg-[#F2F3F5] px-4 text-sm font-semibold text-[#0C0D11]"
            onClick={() => void loadCommentary()}
          >
            Done presenting
          </button>
        </>
      ) : null}

      {phase === "commentary" ? (
        <>
          <p className="text-xs font-bold tracking-[0.08em] text-gold">
            CRUXY AS THE OTHER TEAM
          </p>
          {busy && !commentary ? (
            <p className="text-sm text-[#8C929D]">Building commentary…</p>
          ) : null}
          {commentary ? (
            <div className="rounded-2xl bg-[#16181F] p-4">
              <p className="m-0 whitespace-pre-wrap text-[15px] leading-relaxed text-[#C9CCD3]">
                {commentary}
              </p>
              <button
                type="button"
                className="mt-3 h-[42px] rounded-xl border border-[#3B404A] px-4 text-sm font-semibold"
                onClick={() => speakText(commentary.slice(0, 800))}
              >
                Read aloud again
              </button>
            </div>
          ) : null}
          <span className="font-mono text-[48px] font-semibold text-gold">
            {clock(seconds)}
          </span>
          {start ? (
            <button
              type="button"
              className="h-[46px] rounded-xl bg-[#F2F3F5] px-4 text-sm font-semibold text-[#0C0D11]"
              onClick={() => beginTimed("response", start.timings.response)}
            >
              Start my response ({Math.round(start.timings.response / 60)} min)
            </button>
          ) : null}
        </>
      ) : null}

      {phase === "response" && start ? (
        <>
          <span className="font-mono text-[64px] font-semibold text-gold">
            {clock(seconds)}
          </span>
          <p className="m-0 text-sm text-[#8C929D]">
            Answer the most pressing points. Stay collegial.
          </p>
          {start.roundId ? (
            <ChunkedRecorder
              roundId={start.roundId}
              embedded
              consentOk={start.recordingOk}
              onRecordingChange={setRecording}
            />
          ) : null}
          <button
            type="button"
            className="h-[46px] rounded-xl bg-[#F2F3F5] px-4 text-sm font-semibold text-[#0C0D11]"
            onClick={() => void loadJudges()}
          >
            Go to judges&apos; Q&amp;A
          </button>
        </>
      ) : null}

      {phase === "judges" && start ? (
        <>
          <p className="text-xs font-bold tracking-[0.08em] text-gold">
            CRUXY AS JUDGES
          </p>
          <span className="font-mono text-[48px] font-semibold text-gold">
            {clock(seconds)}
          </span>
          {questions[qIndex] ? (
            <>
              <p className="m-0 text-xs uppercase tracking-[0.08em] text-[#8C929D]">
                {questions[qIndex]!.kind.replaceAll("_", " ")}
              </p>
              <p className="font-display m-0 text-[22px] font-semibold leading-tight">
                &ldquo;{questions[qIndex]!.text}&rdquo;
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="h-[42px] flex-1 rounded-xl border border-[#3B404A] text-sm font-semibold"
                  disabled={qIndex >= questions.length - 1}
                  onClick={() => {
                    const next = qIndex + 1;
                    setQIndex(next);
                    if (questions[next]?.text) speakText(questions[next]!.text);
                  }}
                >
                  Next question
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-[#8C929D]">No judge questions yet.</p>
          )}
          {start.roundId ? (
            <ChunkedRecorder
              roundId={start.roundId}
              embedded
              consentOk={start.recordingOk}
              onRecordingChange={setRecording}
            />
          ) : null}
          <button
            type="button"
            className="h-[46px] rounded-xl bg-[#F2F3F5] px-4 text-sm font-semibold text-[#0C0D11]"
            onClick={() => void finishScoring()}
          >
            End round and get judge card
          </button>
        </>
      ) : null}

      {phase === "scoring" ? (
        <p className="text-sm text-[#8C929D]">Cruxy is filling a judge card…</p>
      ) : null}

      {phase === "done" ? (
        <>
          <p className="text-xs font-bold tracking-[0.08em] text-gold">
            JUDGE CARD
          </p>
          <p className="m-0 text-sm text-[#8C929D]">
            {cards[0]?.overall_comment ||
              "Cruxy scored the round from what it heard or your notes."}
          </p>
          <ul className="m-0 list-none space-y-2 p-0">
            {[...scoreByItem.entries()].slice(0, 12).map(([item, score]) => (
              <li
                key={item}
                className="flex items-center justify-between rounded-xl bg-[#16181F] px-3 py-2 text-sm"
              >
                <span className="text-[#C9CCD3]">
                  {String(item as AppeItemKey).replaceAll("_", " ")}
                </span>
                <span className="font-mono font-semibold text-gold">{score}</span>
              </li>
            ))}
          </ul>
          {feedback.filter((f) => f.kind === "headline").slice(0, 3).map((f) => (
            <p key={f.id} className="m-0 text-sm text-[#C9CCD3]">
              {f.reasoning}
            </p>
          ))}
          <div className="flex flex-col gap-2">
            {start?.roundId ? (
              <Link
                href={`/practice/rounds/${start.roundId}/report`}
                className="inline-flex h-[46px] items-center justify-center rounded-xl bg-[#F2F3F5] text-sm font-semibold text-[#0C0D11]"
              >
                Open full report
              </Link>
            ) : null}
            <Link
              href="/prepare"
              className="inline-flex h-[46px] items-center justify-center rounded-xl border border-[#3B404A] text-sm font-semibold"
            >
              Back to my part
            </Link>
          </div>
        </>
      ) : null}
    </DrillShell>
  );
}
