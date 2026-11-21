"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";

export type CruxyMood =
  | "curious"
  | "neutral"
  | "winking"
  | "happy"
  | "excited"
  | "surprised"
  | "sad"
  | "sleepy"
  | "angry";

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
};

const CruxyContext = createContext<CruxyContextValue | null>(null);

const IDLE_MS = 5 * 60 * 1000;

export function CruxyProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [awake, setAwake] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mood, setMood] = useState<CruxyMood>("curious");
  const [hideFigure, setHideFigure] = useState(false);
  const [recordingOrTimed, setRecordingOrTimed] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [bubble, setBubble] = useState<string | null>(
    "You called. What are you trying to figure out?",
  );

  useEffect(() => {
    void fetch("/api/prefs/cruxy")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { prefs?: { hide_floating_cruxy?: boolean } } | null) => {
        if (d?.prefs?.hide_floating_cruxy) setHideFigure(true);
      })
      .catch(() => undefined);
  }, []);

  // Detect practice/recording routes for auto-hide
  useEffect(() => {
    const timed =
      pathname.includes("/practice") ||
      pathname.includes("/recording") ||
      pathname.includes("/round");
    setRecordingOrTimed(timed);
  }, [pathname]);

  const sleep = useCallback(() => {
    setMood("sleepy");
    setBubble(null);
    setDrawerOpen(false);
    window.setTimeout(() => setAwake(false), 600);
  }, []);

  const wake = useCallback(() => {
    setAwake(true);
    setMood("curious");
    setBubble("You called. What are you trying to figure out?");
    setDrawerOpen(true);
  }, []);

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
      setDrawerOpen,
      setMood,
      setHideFigure,
      setHighlight,
      setCaseId,
      setBubble,
      setRecordingOrTimed,
      sleep,
      wake,
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
