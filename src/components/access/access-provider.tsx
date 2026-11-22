"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_ACCESS_PREFS,
  normalizeAccessPrefs,
  type AccessPrefs,
  type ReduceMotionMode,
  type TextSizeStep,
} from "@/lib/access/types";

type AccessContextValue = {
  prefs: AccessPrefs;
  ready: boolean;
  setPrefsLocal: (next: Partial<AccessPrefs>) => void;
  savePrefs: (next: Partial<AccessPrefs>) => Promise<boolean>;
  reduceMotionActive: boolean;
};

const AccessContext = createContext<AccessContextValue | null>(null);

const STORAGE_KEY = "crux-access-prefs";

function applyToDocument(prefs: AccessPrefs) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.textSize = prefs.text_size;
  root.dataset.highContrast = prefs.high_contrast ? "true" : "false";
  root.dataset.readableFont = prefs.readable_font ? "true" : "false";
  root.dataset.reduceMotion = prefs.reduce_motion;
}

function readLocal(): AccessPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ACCESS_PREFS;
    return normalizeAccessPrefs(JSON.parse(raw) as Partial<AccessPrefs>);
  } catch {
    return DEFAULT_ACCESS_PREFS;
  }
}

function writeLocal(prefs: AccessPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

function systemWantsReduce(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isReduceActive(mode: ReduceMotionMode, system: boolean): boolean {
  if (mode === "on") return true;
  if (mode === "off") return false;
  return system;
}

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<AccessPrefs>(DEFAULT_ACCESS_PREFS);
  const [ready, setReady] = useState(false);
  const [systemReduce, setSystemReduce] = useState(false);

  useEffect(() => {
    const local = readLocal();
    setPrefs(local);
    applyToDocument(local);
    setSystemReduce(systemWantsReduce());
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setSystemReduce(mq.matches);
    mq.addEventListener("change", onChange);

    void fetch("/api/prefs/access")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { prefs?: Partial<AccessPrefs> } | null) => {
        if (!d?.prefs) {
          setReady(true);
          return;
        }
        const next = normalizeAccessPrefs(d.prefs);
        setPrefs(next);
        writeLocal(next);
        applyToDocument(next);
        setReady(true);
      })
      .catch(() => setReady(true));

    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    applyToDocument(prefs);
  }, [prefs]);

  const setPrefsLocal = useCallback((partial: Partial<AccessPrefs>) => {
    setPrefs((prev) => {
      const next = normalizeAccessPrefs({ ...prev, ...partial });
      writeLocal(next);
      applyToDocument(next);
      return next;
    });
  }, []);

  const savePrefs = useCallback(async (partial: Partial<AccessPrefs>) => {
    const next = normalizeAccessPrefs({ ...prefs, ...partial });
    setPrefs(next);
    writeLocal(next);
    applyToDocument(next);
    try {
      const res = await fetch("/api/prefs/access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      window.dispatchEvent(
        new CustomEvent("crux-access-prefs", { detail: next }),
      );
      return res.ok;
    } catch {
      return false;
    }
  }, [prefs]);

  const reduceMotionActive = isReduceActive(prefs.reduce_motion, systemReduce);

  const value = useMemo(
    () => ({
      prefs,
      ready,
      setPrefsLocal,
      savePrefs,
      reduceMotionActive,
    }),
    [prefs, ready, setPrefsLocal, savePrefs, reduceMotionActive],
  );

  return (
    <AccessContext.Provider value={value}>{children}</AccessContext.Provider>
  );
}

export function useAccessPrefs(): AccessContextValue {
  const ctx = useContext(AccessContext);
  if (!ctx) {
    return {
      prefs: DEFAULT_ACCESS_PREFS,
      ready: false,
      setPrefsLocal: () => undefined,
      savePrefs: async () => false,
      reduceMotionActive: false,
    };
  }
  return ctx;
}

export type { TextSizeStep, AccessPrefs };
