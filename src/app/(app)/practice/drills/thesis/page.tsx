"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChunkedRecorder } from "@/components/practice/chunked-recorder";

const PROMPT =
  "Is it ever ethical to profit from predicting a war?";

/**
 * Thesis in 30 seconds. DrillPhone.html parity.
 */
export default function ThesisDrillPage() {
  const [seconds, setSeconds] = useState(18);
  const [running, setRunning] = useState(true);
  const [caption, setCaption] = useState(
    "No, not when the bet is on war or a leader's removal, because insiders...",
  );
  const [recordingOk, setRecordingOk] = useState(false);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [history] = useState([31, 28, 29, 26, 24, 22, 18]);

  useEffect(() => {
    void fetch("/api/auth/me")
      .then((r) => r.json())
      .then(async (me) => {
        if (!me.authenticated) return;
        const person = await fetch("/api/auth/people").then((r) => r.json());
        void person;
        const consent = await fetch("/api/auth/me").then((r) => r.json());
        // Prefer creating/finding a thesis round from sessions list
        const sess = await fetch("/api/practice/sessions").then((r) => r.json());
        const thesis = (sess.sessions ?? []).find(
          (s: { rounds?: { mode: string; id: string }[] }) =>
            s.rounds?.some((r) => r.mode === "thesis_30"),
        );
        const rid =
          thesis?.rounds?.find(
            (r: { mode: string; id: string }) => r.mode === "thesis_30",
          )?.id ?? null;
        setRoundId(rid);
        setRecordingOk(Boolean(consent.person?.recording_ok));
      });
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSeconds((s) => {
        if (s <= 0) {
          setRunning(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const best = Math.min(...history);
  const last = history[history.length - 2] ?? 31;
  const heights = useMemo(
    () => history.map((h) => Math.max(20, Math.round((40 / h) * 100))),
    [history],
  );

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
            THESIS IN 30 SECONDS, CASE 5
          </span>
          <span className="text-[13px] text-[#8C929D]">
            A wording you haven&apos;t seen. One sentence.
          </span>
        </div>

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
            onClick={() => setRunning(false)}
            className="flex h-24 w-24 items-center justify-center rounded-full border-[6px] border-[#3B404A] bg-[#C62828]"
          >
            <span className="h-[30px] w-[30px] rounded-md bg-white" />
          </button>
          <p className="m-0 text-center text-[15px] leading-snug text-[#C9CCD3]">
            &ldquo;{caption}&rdquo;
          </p>
          {roundId ? (
            <ChunkedRecorder
              roundId={roundId}
              embedded
              consentOk={recordingOk}
              onRecordingChange={(on) => {
                if (!on) setRunning(false);
              }}
            />
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
