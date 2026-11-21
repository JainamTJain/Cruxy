"use client";

import { useEffect, useState } from "react";
import { ChunkedRecorder } from "@/components/practice/chunked-recorder";
import { DrillShell } from "@/components/practice/drill-shell";
import { speakText, stopSpeaking } from "@/lib/practice/speech";
import { useDrillSession } from "../use-drill-session";

export default function CommentaryDrillPage() {
  const { session, start, error, busy } = useDrillSession();
  const [presentation, setPresentation] = useState<string | null>(null);
  const [hintMin, setHintMin] = useState(8);
  const [seconds, setSeconds] = useState(0);
  const [phase, setPhase] = useState<"listen" | "comment">("listen");
  const [recording, setRecording] = useState(false);
  const [loadMsg, setLoadMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const s = await start("commentary_drill");
      if (!s) return;
      setLoadMsg("Cruxy is building a presentation…");
      const res = await fetch("/api/practice/drills/commentary", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseId: s.caseId }),
      });
      const data = (await res.json()) as {
        presentation?: string;
        durationHintMin?: number;
        error?: string;
      };
      if (!res.ok) {
        setLoadMsg(data.error ?? "Could not build presentation.");
        return;
      }
      setPresentation(data.presentation ?? null);
      setHintMin(data.durationHintMin ?? 8);
      setLoadMsg(null);
      if (data.presentation) speakText(data.presentation.slice(0, 600));
    })();
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== "comment") return;
    setSeconds(hintMin * 60);
    const id = setInterval(() => {
      setSeconds((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [phase, hintMin]);

  const clock = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
    seconds % 60,
  ).padStart(2, "0")}`;

  return (
    <DrillShell
      eyebrow={`COMMENTARY DRILL${
        session?.caseNumber != null ? `, CASE ${session.caseNumber}` : ""
      }`}
      subtitle="Cruxy presents for 7 to 12 minutes. Then you deliver commentary."
      recording={recording}
    >
      {busy || loadMsg ? (
        <p className="text-sm text-[#8C929D]">{loadMsg ?? "Starting…"}</p>
      ) : null}
      {error ? <p className="text-sm text-[#C62828]">{error}</p> : null}
      {presentation ? (
        <>
          <div className="rounded-2xl bg-[#16181F] p-4">
            <p className="mb-2 text-xs font-bold tracking-[0.08em] text-gold">
              CRUXY AS THE PRESENTING TEAM
            </p>
            <p className="m-0 whitespace-pre-wrap text-[15px] leading-relaxed text-[#C9CCD3]">
              {presentation}
            </p>
            <button
              type="button"
              className="mt-3 h-[42px] rounded-xl border border-[#3B404A] px-4 text-sm font-semibold"
              onClick={() => speakText(presentation.slice(0, 800))}
            >
              Read aloud again
            </button>
          </div>
          {phase === "listen" ? (
            <button
              type="button"
              className="h-[46px] rounded-xl bg-[#F2F3F5] px-4 text-sm font-semibold text-[#0C0D11]"
              onClick={() => {
                stopSpeaking();
                setPhase("comment");
              }}
            >
              Start my commentary ({hintMin} min)
            </button>
          ) : (
            <>
              <span className="font-mono text-[64px] font-semibold text-gold">
                {clock}
              </span>
              {session?.roundId ? (
                <ChunkedRecorder
                  roundId={session.roundId}
                  embedded
                  consentOk={session.recordingOk}
                  autoStart={session.recordingOk}
                  onRecordingChange={setRecording}
                />
              ) : null}
            </>
          )}
        </>
      ) : null}
    </DrillShell>
  );
}
