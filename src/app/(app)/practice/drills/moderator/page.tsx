"use client";

import { useEffect, useState } from "react";
import { ChunkedRecorder } from "@/components/practice/chunked-recorder";
import { DrillShell } from "@/components/practice/drill-shell";
import { speakText, stopSpeaking } from "@/lib/practice/speech";
import { useDrillSession } from "../use-drill-session";

const ANSWER_SECONDS = 90;

export default function ModeratorDrillPage() {
  const { session, start, error, busy } = useDrillSession();
  const [question, setQuestion] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(ANSWER_SECONDS);
  const [running, setRunning] = useState(false);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    void (async () => {
      const s = await start("moderator_drill");
      if (!s) return;
      const res = await fetch("/api/practice/drills/moderator", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseId: s.caseId }),
      });
      const data = (await res.json()) as {
        question?: { text: string } | null;
        message?: string;
      };
      if (!data.question) {
        setMsg(data.message ?? "No questions in the bank yet.");
        return;
      }
      setQuestion(data.question.text);
      speakText(data.question.text);
      setRunning(true);
    })();
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          setRunning(false);
          stopSpeaking();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  return (
    <DrillShell
      eyebrow={`MODERATOR DRILL${
        session?.caseNumber != null ? `, CASE ${session.caseNumber}` : ""
      }`}
      subtitle="Cruxy reads a bank question. Answer out loud before the timer ends."
      recording={recording}
    >
      {busy && !question ? (
        <p className="text-sm text-[#8C929D]">Picking a question…</p>
      ) : null}
      {error ? <p className="text-sm text-[#C62828]">{error}</p> : null}
      {msg ? <p className="text-sm text-[#8C929D]">{msg}</p> : null}
      {question ? (
        <>
          <p className="font-display m-0 text-[26px] font-semibold leading-tight">
            &ldquo;{question}&rdquo;
          </p>
          <div className="flex flex-col items-center gap-4 py-6">
            <span className="font-mono text-[72px] font-semibold leading-none text-gold">
              0:{String(seconds).padStart(2, "0")}
            </span>
            <button
              type="button"
              className="h-[42px] rounded-xl border border-[#3B404A] px-4 text-sm font-semibold"
              onClick={() => speakText(question)}
            >
              Read aloud again
            </button>
          </div>
          {session?.roundId ? (
            <ChunkedRecorder
              roundId={session.roundId}
              embedded
              consentOk={session.recordingOk}
              onRecordingChange={setRecording}
            />
          ) : null}
        </>
      ) : null}
    </DrillShell>
  );
}
