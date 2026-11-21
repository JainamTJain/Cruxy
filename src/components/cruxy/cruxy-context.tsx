"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import {
  moodForEvent,
  type CruxyEvent,
  type CruxyMood,
} from "@/components/cruxy/mood-events";
import { CALL_QUESTION } from "@/lib/cruxy/character";

export type { CruxyMood };

type CruxyContextValue = {
  awake: boolean;
  drawerOpen: boolean;
  mood: CruxyMood;
  hideFigure: boolean;
  recordingOrTimed: boolean;
  page: string;
  highlight: string | null;
  caseId: string | null;
  bubble: string | null;
  setAwake: (v: boolean) => void;
  setDrawerOpen: (v: boolean) => void;
  setMood: (m: CruxyMood) => void;
  setHideFigure: (v: boolean) => void;
  setHighlight: (h: string | null) => void;
  setCaseId: (id: string | null) => void;
  setBubble: (b: string | null) => void;
  setRecordingOrTimed: (v: boolean) => void;
  sleep: () => void;
  wake: () => void;
  emitCruxyEvent: (event: CruxyEvent) => void;
};

const CruxyContext = createContext<CruxyContextValue | null>(null);

const IDLE_MS = 5 * 60 * 1000;
const ASLEEP_KEY = "cruxy-asleep";

export function CruxyProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [awake, setAwake] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mood, setMood] = useState<CruxyMood>("curious");
  const [hideFigure, setHideFigure] = useState(false);
  const [recordingOrTimed, setRecordingOrTimed] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [bubble, setBubble] = useState<string | null>(CALL_QUESTION);
  const moodTimer = useRef<number | null>(null);
  const opponentActive = useRef(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(ASLEEP_KEY) === "1") {
        setAwake(false);
        setBubble(null);
      }
    } catch {
      // ignore
    }
    void fetch("/api/prefs/cruxy")
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (d: {
          prefs?: {
            hide_floating_cruxy?: boolean;
            cruxy_x?: number | null;
            cruxy_y?: number | null;
          };
        } | null) => {
          if (d?.prefs?.hide_floating_cruxy) setHideFigure(true);
          if (
            typeof d?.prefs?.cruxy_x === "number" &&
            typeof d?.prefs?.cruxy_y === "number"
          ) {
            window.dispatchEvent(
              new CustomEvent("cruxy-prefs-pos", {
                detail: { x: d.prefs.cruxy_x, y: d.prefs.cruxy_y },
              }),
            );
          }
        },
      )
      .catch(() => undefined);
  }, []);

  // Live updates when Settings saves hide preference
  useEffect(() => {
    const onPrefs = (e: Event) => {
      const detail = (e as CustomEvent<{ hide_floating_cruxy?: boolean }>)
        .detail;
      if (typeof detail?.hide_floating_cruxy === "boolean") {
        setHideFigure(detail.hide_floating_cruxy);
      }
    };
    window.addEventListener("cruxy-prefs", onPrefs);
    return () => window.removeEventListener("cruxy-prefs", onPrefs);
  }, []);

  // Detect practice/recording routes for auto-hide (D can also call setRecordingOrTimed)
  useEffect(() => {
    const timed =
      pathname.includes("/recording") ||
      pathname.includes("/rounds/") ||
      pathname.includes("/round/");
    setRecordingOrTimed(timed);
  }, [pathname]);

  const clearMoodTimer = useCallback(() => {
    if (moodTimer.current) {
      window.clearTimeout(moodTimer.current);
      moodTimer.current = null;
    }
  }, []);

  const emitCruxyEvent = useCallback(
    (event: CruxyEvent) => {
      const result = moodForEvent(event);
      if (event === "opponent.active") opponentActive.current = true;
      if (event === "opponent.done") opponentActive.current = false;

      setMood(result.mood);
      if (result.bubble !== null) setBubble(result.bubble);

      clearMoodTimer();
      if (result.holdMs > 0 && result.mood !== "sleepy") {
        moodTimer.current = window.setTimeout(() => {
          if (!opponentActive.current) setMood("curious");
        }, result.holdMs);
      }
    },
    [clearMoodTimer],
  );

  const sleep = useCallback(() => {
    emitCruxyEvent("sleep");
    setBubble(null);
    setDrawerOpen(false);
    try {
      localStorage.setItem(ASLEEP_KEY, "1");
    } catch {
      // ignore
    }
    window.setTimeout(() => setAwake(false), 600);
  }, [emitCruxyEvent]);

  const wake = useCallback(() => {
    setAwake(true);
    try {
      localStorage.setItem(ASLEEP_KEY, "0");
    } catch {
      // ignore
    }
    emitCruxyEvent("call.wake");
    setDrawerOpen(true);
  }, [emitCruxyEvent]);

  // Asleep means quiet: ignore bubble/drawer opens unless wake()
  const guardedSetDrawerOpen = useCallback(
    (v: boolean) => {
      if (!awake && v) return;
      setDrawerOpen(v);
    },
    [awake],
  );

  const guardedSetBubble = useCallback(
    (b: string | null) => {
      if (!awake && b) return;
      setBubble(b);
    },
    [awake],
  );

  // Idle sleep
  useEffect(() => {
    if (!awake) return;
    let timer = window.setTimeout(sleep, IDLE_MS);
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(sleep, IDLE_MS);
    };
    window.addEventListener("pointerdown", bump);
    window.addEventListener("keydown", bump);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("keydown", bump);
    };
  }, [awake, sleep]);

  const value = useMemo(
    () => ({
      awake,
      drawerOpen,
      mood,
      hideFigure,
      recordingOrTimed,
      page: pathname,
      highlight,
      caseId,
      bubble,
      setAwake,
      setDrawerOpen: guardedSetDrawerOpen,
      setMood,
      setHideFigure,
      setHighlight,
      setCaseId,
      setBubble: guardedSetBubble,
      setRecordingOrTimed,
      sleep,
      wake,
      emitCruxyEvent,
    }),
    [
      awake,
      drawerOpen,
      mood,
      hideFigure,
      recordingOrTimed,
      pathname,
      highlight,
      caseId,
      bubble,
      sleep,
      wake,
      emitCruxyEvent,
      guardedSetDrawerOpen,
      guardedSetBubble,
    ],
  );

  return (
    <CruxyContext.Provider value={value}>{children}</CruxyContext.Provider>
  );
}

export function useCruxy() {
  const ctx = useContext(CruxyContext);
  if (!ctx) throw new Error("useCruxy outside provider");
  return ctx;
}
