"use client";

import { useCallback, useEffect, useState } from "react";
import { LoadingGenie } from "@/components/cruxy/mood/loading-genie";
import {
  getOfflinePack,
  relativeSavedLabel,
  saveOfflinePack,
  type OfflinePack,
} from "@/lib/offline/pack-store";
import { cn } from "@/lib/utils";

type Props = {
  caseId: string;
  teamId: string;
  className?: string;
};

/**
 * Save this case for offline (UCSB wifi). Own file so C's case page
 * edits stay small.
 */
export function OfflineCaseButton({ caseId, teamId, className }: Props) {
  const [meta, setMeta] = useState<Pick<
    OfflinePack,
    "savedAt" | "bytes"
  > | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(async () => {
    const pack = await getOfflinePack(caseId);
    if (pack) setMeta({ savedAt: pack.savedAt, bytes: pack.bytes });
    else setMeta(null);
  }, [caseId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/offline/pack/${caseId}?teamId=${encodeURIComponent(teamId)}`,
      );
      const raw = await res.text();
      if (!res.ok) {
        try {
          const j = JSON.parse(raw) as { error?: string };
          setError(j.error ?? "Could not save offline.");
        } catch {
          setError("Could not save offline.");
        }
        return;
      }
      const payload = JSON.parse(raw) as {
        caseId: string;
        caseNumber: number;
        title: string;
        savedAt: string;
      };
      await saveOfflinePack({
        caseId: payload.caseId,
        caseNumber: payload.caseNumber,
        title: payload.title,
        savedAt: payload.savedAt,
        bytes: new Blob([raw]).size,
        payload,
      });
      // Warm the SW cache for this pack URL and C's competition routes.
      if ("caches" in window) {
        const cache = await caches.open("crux-offline-v2");
        await cache.put(
          `/api/offline/pack/${caseId}?teamId=${encodeURIComponent(teamId)}`,
          new Response(raw, {
            headers: { "content-type": "application/json" },
          }),
        );
      }
      await refresh();
    } catch {
      setError("Could not save offline on this device.");
    } finally {
      setBusy(false);
    }
  }

  void tick;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {meta ? (
        <p className="m-0 text-xs text-muted">
          {relativeSavedLabel(meta.savedAt)}
        </p>
      ) : (
        <p className="m-0 text-xs text-muted">Not saved for offline yet</p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void save()}
        className="rounded-xl border border-[#E3E5E9] bg-white px-3 py-2 text-sm font-semibold disabled:opacity-60"
      >
        {busy ? (
          <span className="inline-flex items-center gap-2">
            <LoadingGenie compact size={28} label="" />
            Saving…
          </span>
        ) : meta ? (
          "Update offline copy"
        ) : (
          "Save for offline"
        )}
      </button>
      {error ? <p className="m-0 text-xs text-cardinal">{error}</p> : null}
    </div>
  );
}
