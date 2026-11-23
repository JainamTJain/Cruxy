"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  getOfflinePack,
  relativeSavedLabel,
  saveOfflinePack,
} from "@/lib/offline/pack-store";
import { cn } from "@/lib/utils";

type Props = {
  caseId: string;
  teamId: string;
  /** When set, "Save to our Drive" exports this one-pager. */
  onePagerId?: string | null;
  canSaveDrive?: boolean;
  onDriveSaved?: (message: string) => void;
  className?: string;
};

/**
 * One Save or share menu for a case: PDF packet, Drive, offline.
 * Replaces separate Save for offline / Print / Export PDF / Save to Drive.
 */
export function SaveShareMenu({
  caseId,
  teamId,
  onePagerId = null,
  canSaveDrive = true,
  onDriveSaved,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"offline" | "drive" | null>(null);
  const [offlineLabel, setOfflineLabel] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const packetHref = `/case-brain/${caseId}/packet?team=${encodeURIComponent(teamId)}&print=1`;

  const refreshOffline = useCallback(async () => {
    const pack = await getOfflinePack(caseId);
    setOfflineLabel(pack ? relativeSavedLabel(pack.savedAt) : null);
  }, [caseId]);

  useEffect(() => {
    void refreshOffline();
  }, [refreshOffline]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function keepOffline() {
    setBusy("offline");
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(
        `/api/offline/pack/${caseId}?teamId=${encodeURIComponent(teamId)}`,
      );
      const raw = await res.text();
      if (!res.ok) {
        try {
          const j = JSON.parse(raw) as { error?: string };
          setError(j.error ?? "Could not keep this case offline.");
        } catch {
          setError("Could not keep this case offline.");
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
      if ("caches" in window) {
        const cache = await caches.open("crux-offline-v3");
        await cache.put(
          `/api/offline/pack/${caseId}?teamId=${encodeURIComponent(teamId)}`,
          new Response(raw, {
            headers: { "content-type": "application/json" },
          }),
        );
      }
      await refreshOffline();
      setStatus("Kept on this phone.");
    } catch {
      setError("Could not keep this case offline on this device.");
    } finally {
      setBusy(null);
    }
  }

  async function saveDrive() {
    setBusy("drive");
    setError(null);
    setStatus(null);
    try {
      let pagerId = onePagerId;
      if (!pagerId) {
        const look = await fetch(
          `/api/revision/one-pagers?teamId=${encodeURIComponent(teamId)}&caseId=${encodeURIComponent(caseId)}`,
        );
        if (look.ok) {
          const j = (await look.json()) as { onePager?: { id: string } | null };
          pagerId = j.onePager?.id ?? null;
        }
      }
      if (!pagerId) {
        setError("Draft the one pager first, then save it to Drive.");
        return;
      }
      const res = await fetch("/api/revision/one-pagers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "export", onePagerId: pagerId }),
      });
      const data = (await res.json()) as { stub?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not save to Drive.");
        return;
      }
      const msg = data.stub
        ? "Drive export prepared locally. Connect Drive to send the file."
        : "Saved to the team's Drive folder.";
      setStatus(msg);
      onDriveSaved?.(msg);
    } catch {
      setError("Could not save to Drive.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="rounded-xl border border-[#E3E5E9] bg-white px-3 py-2 text-sm font-semibold"
      >
        Save or share
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute left-0 z-30 mt-2 w-[min(100vw-2rem,20rem)] rounded-2xl border border-[#E3E5E9] bg-white p-2 shadow-[0_12px_40px_rgba(17,19,24,0.16)]"
        >
          <Link
            role="menuitem"
            href={packetHref}
            onClick={() => setOpen(false)}
            className="flex w-full flex-col gap-0.5 rounded-xl px-3 py-2.5 text-left hover:bg-[#F7F8FA]"
          >
            <span className="text-sm font-semibold text-ink">
              Download as PDF
            </span>
            <span className="text-xs text-muted">
              Clean case packet for print or a file on your phone.
            </span>
          </Link>

          {canSaveDrive ? (
            <button
              type="button"
              role="menuitem"
              disabled={busy === "drive"}
              onClick={() => void saveDrive()}
              className="flex w-full flex-col gap-0.5 rounded-xl px-3 py-2.5 text-left hover:bg-[#F7F8FA] disabled:opacity-60"
            >
              <span className="text-sm font-semibold text-ink">
                {busy === "drive" ? "Saving to Drive…" : "Save to our Drive"}
              </span>
              <span className="text-xs text-muted">
                Puts the one pager in the team Drive folder.
              </span>
            </button>
          ) : null}

          <button
            type="button"
            role="menuitem"
            disabled={busy === "offline"}
            onClick={() => void keepOffline()}
            className="flex w-full flex-col gap-0.5 rounded-xl px-3 py-2.5 text-left hover:bg-[#F7F8FA] disabled:opacity-60"
          >
            <span className="text-sm font-semibold text-ink">
              {busy === "offline"
                ? "Saving…"
                : "Keep on this phone for offline"}
            </span>
            <span className="text-xs text-muted">
              {offlineLabel ??
                "Case text, brief, cards and questions without wifi."}
            </span>
          </button>

          {status ? (
            <p className="m-0 px-3 py-2 text-xs font-semibold text-[#1F7A4D]" role="status">
              {status}
            </p>
          ) : null}
          {error ? (
            <p className="m-0 px-3 py-2 text-xs text-cardinal">{error}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
