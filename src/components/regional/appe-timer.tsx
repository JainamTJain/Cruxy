"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  APPE_DAY_PHASES,
  formatClock,
  type AppePhaseKey,
} from "@/lib/regional/timings";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "crux-appe-timer-v1";

type TimerState = {
  phaseIndex: number;
  remaining: number;
  running: boolean;
  buzzed: boolean;
};

function loadState(): TimerState {
  if (typeof window === "undefined") {
    return {
      phaseIndex: 0,
      remaining: APPE_DAY_PHASES[0]!.seconds,
      running: false,
      buzzed: false,
    };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error("empty");
    const parsed = JSON.parse(raw) as TimerState;
    if (
      typeof parsed.phaseIndex !== "number" ||
      typeof parsed.remaining !== "number"
    ) {
      throw new Error("bad");
    }
    return { ...parsed, running: false };
  } catch {
    return {
      phaseIndex: 0,
      remaining: APPE_DAY_PHASES[0]!.seconds,
      running: false,
      buzzed: false,
    };
  }
}

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

export function AppeTimer() {
  const [state, setState] = useState<TimerState>(() => loadState());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* offline / private mode */
    }
  }, [state]);

  useEffect(() => {
    if (!state.running) {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
      return;
    }
    tickRef.current = setInterval(() => {
      setState((s) => {
        if (s.remaining <= 0) return { ...s, running: false };
        const next = s.remaining - 1;
        const shouldBuzz = next === 60 && !s.buzzed;
        if (shouldBuzz) buzz();
        return {
          ...s,
          remaining: next,
          buzzed: s.buzzed || shouldBuzz,
          running: next > 0,
        };
      });
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [state.running]);

  const phase = APPE_DAY_PHASES[state.phaseIndex] ?? APPE_DAY_PHASES[0]!;
  const oneMinute = state.remaining <= 60 && state.remaining > 0;

  const goPhase = useCallback((index: number) => {
    const p = APPE_DAY_PHASES[index];
    if (!p) return;
    setState({
      phaseIndex: index,
      remaining: p.seconds,
      running: false,
      buzzed: false,
    });
  }, []);

  return (
    <section className="rounded-[20px] bg-ink p-5 text-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display m-0 text-xl font-extrabold">Round timer</h2>
        <span className="text-[12px] font-semibold text-white/70">
          Works offline. Buzz at one minute left.
        </span>
      </div>
      <p className="mt-1 text-sm text-white/80">{phase.hint}</p>

      <p
        className={cn(
          "font-display mt-4 text-center text-[72px] font-extrabold leading-none tracking-[-0.04em] tabular-nums",
          oneMinute ? "text-[#F5B700]" : "text-white",
        )}
      >
        {formatClock(state.remaining)}
      </p>
      <p className="mt-2 text-center text-sm font-semibold">{phase.label}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-xl bg-cardinal px-4 py-2.5 text-sm font-semibold text-white"
          onClick={() => setState((s) => ({ ...s, running: true }))}
        >
          Start
        </button>
        <button
          type="button"
          className="rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold"
          onClick={() => setState((s) => ({ ...s, running: false }))}
        >
          Pause
        </button>
        <button
          type="button"
          className="rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold"
          onClick={() => {
            const next = Math.min(
              APPE_DAY_PHASES.length - 1,
              state.phaseIndex + 1,
            );
            goPhase(next);
          }}
        >
          Next phase
        </button>
        <button
          type="button"
          className="rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold"
          onClick={() => goPhase(state.phaseIndex)}
        >
          Reset phase
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {APPE_DAY_PHASES.map((p, i) => (
          <button
            key={p.key}
            type="button"
            onClick={() => goPhase(i)}
            className={cn(
              "rounded-lg px-2.5 py-1.5 text-[12px] font-semibold",
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
