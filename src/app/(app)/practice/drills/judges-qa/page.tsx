"use client";

import { useEffect, useState } from "react";
import { ChunkedRecorder } from "@/components/practice/chunked-recorder";
import { DrillFinalizeBar } from "@/components/practice/drill-finalize-bar";
import { DrillShell } from "@/components/practice/drill-shell";
import { speakText, stopSpeaking } from "@/lib/practice/speech";
import { useDrillSession } from "../use-drill-session";

type Q = { kind: string; text: string };

const KIND_LABEL: Record<string, string> = {
  facts: "Facts",
  framework_pushback: "Framework pushback",
  change_facts: "Change the facts",
  practical: "Practical",
};

export default function JudgesQaDrillPage() {
  const { session, start, error, busy } = useDrillSession();
  const [questions, setQuestions] = useState<Q[]>([]);
  const [index, setIndex] = useState(0);
  const [seconds, setSeconds] = useState(60);
  const [recording, setRecording] = useState(false);
  const [loadMsg, setLoadMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const s = await start("judges_qa_drill");
      if (!s) return;
      setLoadMsg("Cruxy is drafting judge questions…");
      const res = await fetch("/api/practice/drills/judges-qa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseId: s.caseId }),
      });
      const data = (await res.json()) as {
        questions?: Q[];
        error?: string;
      };
      if (!res.ok) {
        setLoadMsg(data.error ?? "Could not draft questions.");
        return;
      }
      setQuestions(data.questions ?? []);
      setLoadMsg(null);
      if (data.questions?.[0]?.text) speakText(data.questions[0].text);
    })();
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!questions.length) return;
    setSeconds(60);
    let announced = false;
    const id = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          if (!announced) {
            announced = true;
            if (typeof window !== "undefined" && "speechSynthesis" in window) {
              window.speechSynthesis.speak(
                new SpeechSynthesisUtterance("That's time."),
              );
            }
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [index, questions.length]);

  const current = questions[index];

  return (
    <DrillShell
      eyebrow={`JUDGES' Q&A DRILL${
        session?.caseNumber != null ? `, CASE ${session.caseNumber}` : ""
      }`}
      subtitle="Rapid follow-ups on your claims. Answer out loud."
      recording={recording}
    >
      {busy || loadMsg ? (
        <p className="text-sm text-[#8C929D]">{loadMsg ?? "Starting…"}</p>
      ) : null}
      {error ? <p className="text-sm text-[#C62828]">{error}</p> : null}
      {current ? (
        <>
          <span className="text-xs font-bold tracking-[0.08em] text-gold">
            {(KIND_LABEL[current.kind] ?? current.kind).toUpperCase()},{" "}
            {index + 1}/{questions.length}
          </span>
          <p className="font-display m-0 text-[24px] font-semibold leading-tight">
            &ldquo;{current.text}&rdquo;
          </p>
          <div className="flex flex-col items-center gap-3 py-4">
            <span className="font-mono text-[64px] font-semibold text-gold">
              0:{String(seconds).padStart(2, "0")}
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="h-[42px] rounded-xl border border-[#3B404A] px-4 text-sm font-semibold"
                onClick={() => speakText(current.text)}
              >
                Read aloud again
              </button>
              <button
                type="button"
                className="h-[42px] rounded-xl bg-[#F2F3F5] px-4 text-sm font-semibold text-[#0C0D11]"
                disabled={index >= questions.length - 1}
                onClick={() => {
                  const next = index + 1;
                  setIndex(next);
                  if (questions[next]) speakText(questions[next].text);
                }}
              >
                Next question
              </button>
            </div>
          </div>
          {seconds === 0 ? (
            <p className="text-sm font-semibold text-[#F87171]" role="status">
              That&apos;s time. Move to the next question or finish below.
            </p>
          ) : null}
          {session?.roundId ? (
            <>
              <ChunkedRecorder
                roundId={session.roundId}
                embedded
                consentOk={session.recordingOk}
                onRecordingChange={setRecording}
              />
              <DrillFinalizeBar roundId={session.roundId} />
            </>
          ) : null}
        </>
      ) : null}
    </DrillShell>
  );
}
