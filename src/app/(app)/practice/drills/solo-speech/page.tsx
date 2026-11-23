"use client";

import { useEffect, useState } from "react";
import { ChunkedRecorder } from "@/components/practice/chunked-recorder";
import { DrillFinalizeBar } from "@/components/practice/drill-finalize-bar";
import { DrillShell } from "@/components/practice/drill-shell";
import { LiveCaptions } from "@/components/practice/live-captions";
import { useDrillSession } from "../use-drill-session";

const SPEECH_SECONDS = 7 * 60;

/**
 * Solo speech: one timed speaking part, then finalize to a judge card.
 */
export default function SoloSpeechPage() {
  const { session, start, error, busy, saveCheckpoint } = useDrillSession();
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(SPEECH_SECONDS);
  const [running, setRunning] = useState(false);
  const [timeUp, setTimeUp] = useState(false);

  useEffect(() => {
    void (async () => {
      const s = await start("solo_speech");
      if (!s) return;
      if (s.resumed && s.checkpoint) {
        setSeconds(
          typeof s.checkpoint.seconds_left === "number"
            ? s.checkpoint.seconds_left
            : SPEECH_SECONDS,
        );
        setRunning(Boolean(s.checkpoint.running));
        return;
      }
      setRunning(true);
      saveCheckpoint({
        phase: "presentation",
        seconds_left: SPEECH_SECONDS,
        running: true,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          setRunning(false);
          setTimeUp(true);
          saveCheckpoint({
            phase: "presentation",
            seconds_left: 0,
            running: false,
          });
          if (typeof window !== "undefined" && "speechSynthesis" in window) {
            window.speechSynthesis.speak(
              new SpeechSynthesisUtterance("That's time."),
            );
          }
          return 0;
        }
        const next = s - 1;
        if (next % 15 === 0) {
          saveCheckpoint({
            phase: "presentation",
            seconds_left: next,
            running: true,
          });
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, saveCheckpoint]);

  const m = Math.floor(seconds / 60);
  const r = seconds % 60;

  return (
    <DrillShell
      eyebrow={`SOLO SPEECH${
        session?.caseNumber != null ? `, CASE ${session.caseNumber}` : ""
      }`}
      subtitle="One speaking part. When you finish, get the report."
      recording={recording}
    >
      {busy && !session ? (
        <p className="text-sm text-[#8C929D]">Starting…</p>
      ) : null}
      {error ? <p className="text-sm text-[#C62828]">{error}</p> : null}
      <div className="flex flex-col items-center gap-3 py-4">
        <span className="font-mono text-[64px] font-semibold text-gold">
          {m}:{String(r).padStart(2, "0")}
        </span>
        {timeUp ? (
          <p className="m-0 text-sm font-semibold text-[#F87171]" role="status">
            That&apos;s time. Stop speaking, then finish below.
          </p>
        ) : null}
      </div>
      {session?.roundId ? (
        <>
          <ChunkedRecorder
            roundId={session.roundId}
            embedded
            consentOk={session.recordingOk}
            autoStart={running}
            onRecordingChange={setRecording}
            ownerMode
          />
          <LiveCaptions enabled={recording} />
          <DrillFinalizeBar roundId={session.roundId} />
        </>
      ) : null}
    </DrillShell>
  );
}
