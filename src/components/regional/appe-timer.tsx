"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  APPE_DAY_PHASES,
  formatClock,
  type AppePhaseKey,
} from "@/lib/regional/timings";
import {
  APPE_TIMER_STORAGE_KEY,
  catchUpAfterWake,
  defaultTimerState,
  goToPhase,
  parseStoredTimer,
  pauseRunning,
  remainingSeconds,
  shouldBuzzOneMinute,
  startRunning,
  type AppeTimerPersisted,
} from "@/lib/regional/timer-engine";
import { cn } from "@/lib/utils";

function buzz() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.12;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      void ctx.close();
    }, 350);
  } catch {
    /* silent if audio blocked */
  }
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate?.(200);
    } catch {
      /* ignore */
    }
  }
}

function loadState(): AppeTimerPersisted {
  if (typeof window === "undefined") return defaultTimerState();
  try {
    return parseStoredTimer(localStorage.getItem(APPE_TIMER_STORAGE_KEY));
  } catch {
    return defaultTimerState();
  }
}

export function AppeTimer() {
  const [state, setState] = useState<AppeTimerPersisted>(() => loadState());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const prevRemainingRef = useRef<number>(remainingSeconds(state, Date.now()));

  // Persist after every meaningful change.
  useEffect(() => {
    try {
      localStorage.setItem(APPE_TIMER_STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* offline / private mode */
    }
  }, [state]);

  // Wall-clock tick: re-read Date.now() so sleeping tabs catch up correctly.
  useEffect(() => {
    if (!state.running) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [state.running]);

  // Phone lock / tab sleep: catch up as soon as we are visible again.
  useEffect(() => {
    function wake() {
      const now = Date.now();
      setNowMs(now);
      setState((s) => catchUpAfterWake(s, now));
    }
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("pageshow", wake);
    window.addEventListener("focus", wake);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("pageshow", wake);
      window.removeEventListener("focus", wake);
    };
  }, []);

  const displayRemaining = remainingSeconds(state, nowMs);

  // Buzz once when we cross one minute; stop when time hits zero.
  useEffect(() => {
    const prev = prevRemainingRef.current;
    prevRemainingRef.current = displayRemaining;
    if (
      shouldBuzzOneMinute(prev, displayRemaining, state.buzzed)
    ) {
      buzz();
      setState((s) => ({ ...s, buzzed: true }));
    }
    if (state.running && displayRemaining <= 0) {
      setState((s) => ({
        ...s,
        remaining: 0,
        endsAtMs: null,
        running: false,
      }));
    }
  }, [displayRemaining, state.running, state.buzzed]);

  const phase = APPE_DAY_PHASES[state.phaseIndex] ?? APPE_DAY_PHASES[0]!;
  const oneMinute = displayRemaining <= 60 && displayRemaining > 0;

  const selectPhase = useCallback((index: number) => {
    setState(goToPhase(index));
    setNowMs(Date.now());
  }, []);

  return (
    <section className="rounded-[20px] bg-ink p-5 text-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display m-0 text-xl font-extrabold">Round timer</h2>
        <span className="text-[12px] font-semibold text-white/70">
          Works offline. Keeps time if the phone locks. Buzz at one minute.
        </span>
      </div>
      <p className="mt-1 text-sm text-white/80">{phase.hint}</p>

      <p
        className={cn(
          "font-display mt-4 text-center text-[72px] font-extrabold leading-none tracking-[-0.04em] tabular-nums max-[390px]:text-[56px]",
          oneMinute ? "text-[#F5B700]" : "text-white",
        )}
        aria-live="polite"
        aria-atomic="true"
      >
        {formatClock(displayRemaining)}
      </p>
      <p className="mt-2 text-center text-sm font-semibold">{phase.label}</p>
      {state.running ? (
        <p className="mt-1 text-center text-[12px] text-white/60">
          Running. Time is based on the clock, not the screen.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="min-h-11 rounded-xl bg-cardinal px-4 py-2.5 text-sm font-semibold text-white"
          onClick={() => {
            const now = Date.now();
            setNowMs(now);
            setState((s) => startRunning(s, now));
          }}
        >
          Start
        </button>
        <button
          type="button"
          className="min-h-11 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold"
          onClick={() => {
            const now = Date.now();
            setNowMs(now);
            setState((s) => pauseRunning(s, now));
          }}
        >
          Pause
        </button>
        <button
          type="button"
          className="min-h-11 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold"
          onClick={() => {
            const next = Math.min(
              APPE_DAY_PHASES.length - 1,
              state.phaseIndex + 1,
            );
            selectPhase(next);
          }}
        >
          Next phase
        </button>
        <button
          type="button"
          className="min-h-11 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold"
          onClick={() => selectPhase(state.phaseIndex)}
        >
          Reset phase
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Phases">
        {APPE_DAY_PHASES.map((p, i) => (
          <button
            key={p.key}
            type="button"
            onClick={() => selectPhase(i)}
            className={cn(
              "min-h-10 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold",
              i === state.phaseIndex
                ? "bg-white text-ink"
                : "bg-white/10 text-white/85",
            )}
          >
            {p.label}
            <span className="ml-1 opacity-70">
              {formatClock(p.seconds)}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-white/60">
        Phases: presentation, conferral, commentary, response, judges&apos;
        questions. Times follow the APPE ranges in our domain notes.
      </p>
    </section>
  );
}

export type { AppePhaseKey };
