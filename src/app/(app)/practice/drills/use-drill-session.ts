"use client";

import { useCallback, useState } from "react";
import type { PracticeMode } from "@/lib/practice/types";

export type DrillSession = {
  sessionId: string;
  roundId: string;
  caseId: string | null;
  caseNumber: number | null;
  caseTitle: string | null;
  teamId: string | null;
  recordingOk: boolean;
};

function caseIdFromUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get("caseId") ?? undefined;
}

export function useDrillSession() {
  const [session, setSession] = useState<DrillSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const start = useCallback(async (mode: PracticeMode, caseId?: string) => {
    setBusy(true);
    setError(null);
    try {
      const resolvedCase = caseId || caseIdFromUrl() || undefined;
      const res = await fetch("/api/practice/drills/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, caseId: resolvedCase || null }),
      });
      const data = (await res.json()) as DrillSession & { error?: string };
      if (!res.ok || !data.roundId) {
        setError(data.error ?? "Could not start drill.");
        return null;
      }
      const next: DrillSession = {
        sessionId: data.sessionId,
        roundId: data.roundId,
        caseId: data.caseId,
        caseNumber: data.caseNumber,
        caseTitle: data.caseTitle,
        teamId: data.teamId,
        recordingOk: data.recordingOk,
      };
      setSession(next);
      return next;
    } catch {
      setError("Could not start drill.");
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  return { session, setSession, error, busy, start };
}
