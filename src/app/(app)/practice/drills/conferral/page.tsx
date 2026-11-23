"use client";

import { useEffect, useRef, useState } from "react";
import { ChunkedRecorder } from "@/components/practice/chunked-recorder";
import { DrillFinalizeBar } from "@/components/practice/drill-finalize-bar";
import { DrillShell } from "@/components/practice/drill-shell";
import { speakText, stopSpeaking } from "@/lib/practice/speech";
import { useDrillSession } from "../use-drill-session";

type Phase = "load" | "confer" | "answer" | "done";

export default function ConferralDrillPage() {
  const { session, start, error, busy } = useDrillSession();
  const [phase, setPhase] = useState<Phase>("load");
  const [question, setQuestion] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(60);
  const [recording, setRecording] = useState(false);
  const [silenceNote, setSilenceNote] = useState<string | null>(null);
  const windowRef = useRef<{ start: number; end: number } | null>(null);

  useEffect(() => {
    void (async () => {
      const s = await start("conferral_drill");
      if (!s) return;
      const res = await fetch("/api/practice/drills/conferral", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "question", caseId: s.caseId }),
      });
      const data = (await res.json()) as {
        question?: { text: string } | null;
        message?: string;
        conferralSeconds?: number;
      };
      if (!data.question) {
        setSilenceNote(data.message ?? "No bank questions yet.");
        setPhase("done");
        return;
      }
      setQuestion(data.question.text);
      speakText(data.question.text);
      setSeconds(data.conferralSeconds ?? 60);
      windowRef.current = { start: 0, end: (data.conferralSeconds ?? 60) * 1000 };
      setPhase("confer");
    })();
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== "confer" && phase !== "answer") return;
    const id = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          if (phase === "confer") {
            void finishConferral();
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function finishConferral() {
    stopSpeaking();
    // Silence check needs a saved transcript. Until Finish runs, remind the room.
    if (session?.roundId && windowRef.current) {
      const res = await fetch("/api/practice/drills/conferral", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "check",
          roundId: session.roundId,
          conferralStartMs: windowRef.current.start,
          conferralEndMs: windowRef.current.end,
        }),
      });
      const data = (await res.json()) as {
        spoke?: boolean;
        speakers?: string[];
      };
      if (data.spoke) {
        setSilenceNote(
          `Someone spoke during conferral${
            data.speakers?.length ? ` (${data.speakers.join(", ")})` : ""
          }. Rules allow scratch paper only.`,
        );
      } else {
        setSilenceNote(
          "No transcript lines in the conferral window yet (normal before Finish). Keep quiet, answer now, then Finish to check.",
        );
      }
    }
    setSeconds(90);
    setPhase("answer");
  }

  return (
    <DrillShell
      eyebrow={`CONFERRAL DRILL${
        session?.caseNumber != null ? `, CASE ${session.caseNumber}` : ""
      }`}
      subtitle="Unseen question. 60 seconds with scratch paper only, then answer."
      recording={recording}
    >
      {busy && phase === "load" ? (
        <p className="text-sm text-[#8C929D]">Loading…</p>
      ) : null}
      {error ? <p className="text-sm text-[#C62828]">{error}</p> : null}
      {question ? (
        <p className="font-display m-0 text-[24px] font-semibold leading-tight">
          &ldquo;{question}&rdquo;
        </p>
      ) : null}
      {phase === "confer" ? (
        <>
          <p className="text-sm text-[#8C929D]">
            Confer now. Do not speak. Scratch paper only.
          </p>
          <span className="font-mono text-[72px] font-semibold text-gold">
            0:{String(seconds).padStart(2, "0")}
          </span>
          <button
            type="button"
            className="h-[46px] rounded-xl bg-[#F2F3F5] px-4 text-sm font-semibold text-[#0C0D11]"
            onClick={() => void finishConferral()}
          >
            End conferral early
          </button>
        </>
      ) : null}
      {phase === "answer" ? (
        <>
          {silenceNote ? (
            <p className="text-sm text-[#C9CCD3]">{silenceNote}</p>
          ) : null}
          <span className="font-mono text-[64px] font-semibold text-gold">
            0:{String(seconds).padStart(2, "0")}
          </span>
          <button
            type="button"
            className="h-[42px] self-start rounded-xl border border-[#3B404A] px-4 text-sm font-semibold"
            onClick={() => question && speakText(question)}
          >
            Read question aloud again
          </button>
          {session?.roundId ? (
            <>
              <ChunkedRecorder
                roundId={session.roundId}
                embedded
                consentOk={session.recordingOk}
                autoStart={session.recordingOk}
                onRecordingChange={setRecording}
              />
              <DrillFinalizeBar roundId={session.roundId} />
            </>
          ) : null}
        </>
      ) : null}
      {phase === "done" && silenceNote ? (
        <p className="text-sm text-[#8C929D]">{silenceNote}</p>
      ) : null}
    </DrillShell>
  );
}
