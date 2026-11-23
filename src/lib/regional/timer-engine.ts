/**
 * Wall-clock APPE timer math. Uses endsAtMs so locked phones and sleeping
 * tabs still show the correct remaining time when the page wakes.
 */

import { APPE_DAY_PHASES } from "@/lib/regional/timings";

export const APPE_TIMER_STORAGE_KEY = "crux-appe-timer-v2";

export type AppeTimerPersisted = {
  phaseIndex: number;
  /** Seconds left when paused (or at load). */
  remaining: number;
  /** Absolute deadline while running; null when paused. */
  endsAtMs: number | null;
  running: boolean;
  buzzed: boolean;
};

export function defaultTimerState(): AppeTimerPersisted {
  return {
    phaseIndex: 0,
    remaining: APPE_DAY_PHASES[0]!.seconds,
    endsAtMs: null,
    running: false,
    buzzed: false,
  };
}

export function remainingSeconds(
  state: AppeTimerPersisted,
  nowMs: number,
): number {
  if (state.running && state.endsAtMs != null) {
    return Math.max(0, Math.ceil((state.endsAtMs - nowMs) / 1000));
  }
  return Math.max(0, Math.floor(state.remaining));
}

/** True when the countdown just crossed (or landed on) the one-minute mark. */
export function shouldBuzzOneMinute(
  prevRemaining: number,
  nextRemaining: number,
  alreadyBuzzed: boolean,
): boolean {
  if (alreadyBuzzed) return false;
  if (nextRemaining <= 0) return false;
  return prevRemaining > 60 && nextRemaining <= 60;
}

export function startRunning(
  state: AppeTimerPersisted,
  nowMs: number,
): AppeTimerPersisted {
  const left = remainingSeconds(state, nowMs);
  if (left <= 0) {
    return { ...state, remaining: 0, endsAtMs: null, running: false };
  }
  return {
    ...state,
    remaining: left,
    endsAtMs: nowMs + left * 1000,
    running: true,
  };
}

export function pauseRunning(
  state: AppeTimerPersisted,
  nowMs: number,
): AppeTimerPersisted {
  const left = remainingSeconds(state, nowMs);
  return {
    ...state,
    remaining: left,
    endsAtMs: null,
    running: false,
  };
}

export function goToPhase(index: number): AppeTimerPersisted {
  const phase = APPE_DAY_PHASES[index];
  if (!phase) return defaultTimerState();
  return {
    phaseIndex: index,
    remaining: phase.seconds,
    endsAtMs: null,
    running: false,
    buzzed: false,
  };
}

export function catchUpAfterWake(
  state: AppeTimerPersisted,
  nowMs: number,
): AppeTimerPersisted {
  if (!state.running || state.endsAtMs == null) return state;
  const left = remainingSeconds(state, nowMs);
  if (left <= 0) {
    return {
      ...state,
      remaining: 0,
      endsAtMs: null,
      running: false,
    };
  }
  return { ...state, remaining: left };
}

export function parseStoredTimer(raw: string | null): AppeTimerPersisted {
  if (!raw) return defaultTimerState();
  try {
    const parsed = JSON.parse(raw) as Partial<AppeTimerPersisted> & {
      /** Legacy v1 shape used setInterval only. */
      remaining?: number;
      phaseIndex?: number;
      running?: boolean;
      buzzed?: boolean;
      endsAtMs?: number | null;
    };
    if (
      typeof parsed.phaseIndex !== "number" ||
      typeof parsed.remaining !== "number"
    ) {
      return defaultTimerState();
    }
    const phaseIndex = Math.min(
      Math.max(0, Math.floor(parsed.phaseIndex)),
      APPE_DAY_PHASES.length - 1,
    );
    const base: AppeTimerPersisted = {
      phaseIndex,
      remaining: Math.max(0, parsed.remaining),
      endsAtMs:
        typeof parsed.endsAtMs === "number" ? parsed.endsAtMs : null,
      running: Boolean(parsed.running && parsed.endsAtMs),
      buzzed: Boolean(parsed.buzzed),
    };
    return catchUpAfterWake(base, Date.now());
  } catch {
    return defaultTimerState();
  }
}
