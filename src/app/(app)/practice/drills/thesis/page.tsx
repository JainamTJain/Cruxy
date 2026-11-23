"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChunkedRecorder } from "@/components/practice/chunked-recorder";
import { DrillFinalizeBar } from "@/components/practice/drill-finalize-bar";
import { useDrillSession } from "../use-drill-session";

const PROMPT =
  "Is it ever ethical to profit from predicting a war?";
const ANSWER_SECONDS = 30;

/**
 * Thesis in 30 seconds. Creates or resumes a drill round so audio chunks save.
 */
export default function ThesisDrillPage() {
  const { session, start, error, busy, saveCheckpoint } = useDrillSession();
  const [seconds, setSeconds] = useState(ANSWER_SECONDS);
  const [running, setRunning] = useState(false);
  const [caption, setCaption] = useState(
    "No, not when the bet is on war or a leader's removal, because insiders...",
  );
  const [history] = useState([31, 28, 29, 26, 24, 22, 18]);

  useEffect(() => {
    void (async () => {
      const s = await start("thesis_30");
      if (!s) return;
      if (s.resumed && s.checkpoint) {
        setSeconds(
          typeof s.checkpoint.seconds_left === "number"
            ? s.checkpoint.seconds_left
            : ANSWER_SECONDS,
        );
        setRunning(Boolean(s.checkpoint.running));
        if (s.checkpoint.prompt) setCaption(s.checkpoint.prompt);
        return;
      }
      setRunning(true);
      saveCheckpoint({
        phase: "answer",
        prompt: PROMPT,
        seconds_left: ANSWER_SECONDS,
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
          saveCheckpoint({
            phase: "answer",
            prompt: PROMPT,
            seconds_left: 0,
            running: false,
          });
          return 0;
        }
        const next = s - 1;
        if (next % 5 === 0) {
          saveCheckpoint({
            phase: "answer",
            prompt: PROMPT,
            seconds_left: next,
            running: true,
          });
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, saveCheckpoint]);

  const best = Math.min(...history);
  const last = history[history.length - 2] ?? 31;
  const heights = useMemo(
    () => history.map((h) => Math.max(20, Math.round((40 / h) * 100))),
    [history],
  );

  const caseLabel =
    session?.caseNumber != null ? `CASE ${session.caseNumber}` : "CASE";

  return (
    <div className="fixed inset-0 z-40 overflow-hidden bg-[#0C0D11] text-[#F2F3F5]">
      <div className="mx-auto flex h-full w-full max-w-[390px] flex-col gap-4 px-[18px] py-[18px]">
        <div className="flex items-center justify-between">
          <Link
            href="/practice"
            className="font-display text-[26px] font-extrabold tracking-[-0.03em]"
          >
            crux
          </Link>
          <span className="flex items-center gap-1.5 text-xs font-bold text-[#C62828]">
            <span className="h-2 w-2 rounded-full bg-[#C62828]" />
            REC
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold tracking-[0.1em] text-gold">
            THESIS IN 30 SECONDS, {caseLabel}
          </span>
          <span className="text-[13px] text-[#8C929D]">
            {session?.resumed
              ? "Picking up where you left off."
              : "A wording you have not seen. One sentence."}
          </span>
        </div>

        {busy && !session ? (
          <p className="text-sm text-[#8C929D]">Starting drill…</p>
        ) : null}
        {error ? <p className="text-sm text-[#C62828]">{error}</p> : null}

        <p className="font-display m-0 text-[28px] font-semibold leading-tight">
          &ldquo;{PROMPT}&rdquo;
        </p>

        <div className="flex flex-1 flex-col items-center justify-center gap-[18px]">
          <span className="font-mono text-[88px] font-semibold leading-none text-gold">
            0:{String(seconds).padStart(2, "0")}
          </span>
          <button
            type="button"
            aria-label="Stop recording"
            onClick={() => {
              setRunning(false);
              saveCheckpoint({
                phase: "answer",
                prompt: PROMPT,
                seconds_left: seconds,
                running: false,
              });
            }}
            className="flex h-24 w-24 items-center justify-center rounded-full border-[6px] border-[#3B404A] bg-[#C62828]"
          >
            <span className="h-[30px] w-[30px] rounded-md bg-white" />
          </button>
          <p className="m-0 text-center text-[15px] leading-snug text-[#C9CCD3]">
            &ldquo;{caption}&rdquo;
          </p>
          {seconds === 0 ? (
            <p className="m-0 text-sm font-semibold text-[#F87171]" role="status">
              That&apos;s time.
            </p>
          ) : null}
          {session?.roundId ? (
            <>
              <ChunkedRecorder
                roundId={session.roundId}
                embedded
                consentOk={session.recordingOk}
                onRecordingChange={(on) => {
                  if (!on) setRunning(false);
                }}
              />
              <div className="w-full">
                <DrillFinalizeBar roundId={session.roundId} />
              </div>
            </>
          ) : null}
        </div>

        <div className="flex flex-col gap-2.5 rounded-2xl bg-[#16181F] p-3.5">
          <div className="flex justify-between text-[13px]">
            <strong>Your time to a thesis</strong>
            <span className="text-[#8C929D]">
              best 0:{String(best).padStart(2, "0")}, last 0:
              {String(last).padStart(2, "0")}
            </span>
          </div>
          <div className="flex h-14 items-end gap-1.5">
            {heights.map((h, i) => (
              <div
                key={i}
                className="bar w-full rounded-t"
                style={{
                  height: `${h}%`,
                  background: i === heights.length - 1 ? "#F5B700" : "#3B404A",
                }}
              />
            ))}
          </div>
          <span className="text-xs text-[#8C929D]">
            Measured against your own past answers only.
          </span>
        </div>
      </div>
    </div>
  );
}
