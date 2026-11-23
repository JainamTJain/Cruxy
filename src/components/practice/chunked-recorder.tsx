"use client";

import { useEffect, useRef, useState } from "react";
import {
  CLIENT_CHUNK_MS,
  resolveNextIndexAfterUpload,
  uploadChunkWithRetry,
} from "@/lib/practice/chunk-upload";

type Props = {
  roundId: string;
  onStopped?: (info: { chunksUploaded: number }) => void;
  onRecordingChange?: (recording: boolean) => void;
  disabled?: boolean;
  /** Hide chrome when embedded in the dark practice room. */
  embedded?: boolean;
  autoStart?: boolean;
  consentOk: boolean;
  /** F-219: this phone records its owner. */
  ownerMode?: boolean;
};

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
    return "audio/webm;codecs=opus";
  }
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return undefined;
}

function detectBrowser(): { name: string; ok: boolean; tip: string } {
  if (typeof navigator === "undefined") {
    return { name: "Unknown", ok: false, tip: "Open on a phone browser to record." };
  }
  const ua = navigator.userAgent;
  const isSafari = /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg/i.test(ua);
  const isChrome =
    /Chrome|Chromium|CriOS/i.test(ua) && !/Edg/i.test(ua);
  const hasMedia =
    typeof MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia);
  const mime = pickMimeType();
  if (isSafari) {
    return {
      name: "Safari",
      ok: hasMedia && Boolean(mime),
      tip: hasMedia
        ? mime?.includes("mp4")
          ? "Safari ready (mp4 chunks)."
          : "Safari ready."
        : "Safari needs microphone permission. Settings, then Safari, then Microphone.",
    };
  }
  if (isChrome) {
    return {
      name: "Chrome",
      ok: hasMedia && Boolean(mime),
      tip: hasMedia ? "Chrome ready (webm chunks)." : "Chrome needs microphone permission.",
    };
  }
  return {
    name: "Browser",
    ok: hasMedia && Boolean(mime),
    tip: hasMedia
      ? "Recording supported on this browser."
      : "Use Safari on iPhone or Chrome on Android.",
  };
}

/**
 * Browser recorder: saves short parts as you speak.
 * A crash loses at most the current unfinished chunk (~10s).
 */
export function ChunkedRecorder({
  roundId,
  onStopped,
  onRecordingChange,
  disabled,
  embedded,
  autoStart,
  consentOk,
  ownerMode,
}: Props) {
  const [recording, setRecording] = useState(false);
  const [chunks, setChunks] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [nextIndex, setNextIndex] = useState(0);
  const [browser, setBrowser] = useState(() => detectBrowser());
  const [pendingUploads, setPendingUploads] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const indexRef = useRef(0);
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null);
  const uploadQueueRef = useRef<Promise<void>>(Promise.resolve());
  const chunksRef = useRef(0);
  const stoppingRef = useRef(false);

  useEffect(() => {
    setBrowser(detectBrowser());
    void fetch(`/api/practice/rounds/${roundId}/chunks`)
      .then((r) => r.json())
      .then((d: { nextIndex?: number; chunks?: number; maxLossMs?: number }) => {
        indexRef.current = d.nextIndex ?? 0;
        setNextIndex(d.nextIndex ?? 0);
        setChunks(d.chunks ?? 0);
        chunksRef.current = d.chunks ?? 0;
      })
      .catch(() => {
        setError(
          "Could not check saved audio parts. You can still start; we will retry uploads.",
        );
      });
    return () => {
      mediaRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void wakeRef.current?.release();
    };
  }, [roundId]);

  useEffect(() => {
    if (autoStart && consentOk && !recording && !disabled && browser.ok) {
      void start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, consentOk]);

  // Warn before closing the tab while recording or uploads are in flight.
  useEffect(() => {
    if (!recording && pendingUploads === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onPageHide = () => {
      try {
        const rec = mediaRef.current;
        if (rec && rec.state === "recording") {
          rec.requestData();
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [recording, pendingUploads]);

  function enqueueUpload(blob: Blob, type: string) {
    setPendingUploads((n) => n + 1);
    uploadQueueRef.current = uploadQueueRef.current
      .then(async () => {
        // Index advances only after a successful POST (or 409 resync).
        let index = indexRef.current;
        let result = await uploadChunkWithRetry({
          roundId,
          blob,
          index,
          mime: type,
        });

        if (!result.ok && result.status === 409 && typeof result.nextIndex === "number") {
          index = result.nextIndex;
          indexRef.current = index;
          setNextIndex(index);
          setStatusLine(`Synced to part #${index}. Retrying this audio part.`);
          result = await uploadChunkWithRetry({
            roundId,
            blob,
            index,
            mime: type,
          });
        }

        if (result.ok) {
          setError(null);
          setStatusLine(null);
          chunksRef.current += 1;
          setChunks(chunksRef.current);
          indexRef.current = result.nextIndex;
          setNextIndex(result.nextIndex);
          return;
        }

        const synced = resolveNextIndexAfterUpload({
          attemptedIndex: index,
          status: result.status,
          body: {
            error: result.error,
            nextIndex: result.nextIndex,
            maxLossMs: result.maxLossMs,
          },
          currentNext: indexRef.current,
        });
        indexRef.current = synced;
        setNextIndex(synced);
        setError(result.error);
        if (result.status === 0 || result.status >= 500) {
          setStatusLine(
            "Stay on this page. We keep the last part and retry. At most about 10 seconds can be lost.",
          );
        }
      })
      .finally(() => {
        setPendingUploads((n) => Math.max(0, n - 1));
      });
  }

  async function start() {
    setError(null);
    setStatusLine(null);
    stoppingRef.current = false;
    if (!consentOk) {
      setError("Recording needs consent. Agree on the consent screen first.");
      return;
    }
    if (!browser.ok) {
      setError(browser.tip);
      return;
    }
    try {
      // Refresh resume index before starting so a tab reopen continues cleanly.
      try {
        const resumeRes = await fetch(`/api/practice/rounds/${roundId}/chunks`);
        if (resumeRes.ok) {
          const d = (await resumeRes.json()) as {
            nextIndex?: number;
            chunks?: number;
          };
          indexRef.current = d.nextIndex ?? 0;
          setNextIndex(d.nextIndex ?? 0);
          setChunks(d.chunks ?? 0);
          chunksRef.current = d.chunks ?? 0;
        }
      } catch {
        /* use existing index */
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRef.current = recorder;
      recorder.ondataavailable = (ev) => {
        if (ev.data.size === 0) return;
        // Queue blobs in order; the worker assigns the next free index on success only.
        enqueueUpload(ev.data, recorder.mimeType || mimeType || "audio/webm");
      };
      recorder.start(CLIENT_CHUNK_MS);
      setRecording(true);
      onRecordingChange?.(true);
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> };
        };
        if (nav.wakeLock) {
          wakeRef.current = await nav.wakeLock.request("screen");
        }
      } catch {
        setStatusLine(
          "Screen may sleep on this phone. Keep the screen on while you record.",
        );
      }
    } catch {
      setError(
        "Microphone permission needed to record. On iPhone: Settings, Safari, Microphone. Then reload.",
      );
    }
  }

  async function stop() {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    const rec = mediaRef.current;
    try {
      if (rec && rec.state === "recording") {
        // Flush the final partial chunk before stop.
        try {
          rec.requestData();
        } catch {
          /* some browsers throw if timeslice already fired */
        }
        await new Promise<void>((resolve) => {
          const done = () => {
            rec.removeEventListener("stop", done);
            resolve();
          };
          rec.addEventListener("stop", done);
          try {
            rec.stop();
          } catch {
            resolve();
          }
        });
      }
    } finally {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void wakeRef.current?.release();
      mediaRef.current = null;
      streamRef.current = null;
      setRecording(false);
      onRecordingChange?.(false);
    }
    // Wait for in-flight uploads so End round does not race the last part.
    await uploadQueueRef.current.catch(() => undefined);
    onStopped?.({ chunksUploaded: chunksRef.current });
    stoppingRef.current = false;
  }

  const badge = (
    <span
      className={
        embedded
          ? "rounded-lg border border-[#3B404A] px-2 py-0.5 text-[11px] font-semibold text-[#8C929D]"
          : "rounded-lg border border-line px-2 py-0.5 text-[11px] font-semibold text-muted"
      }
      title={browser.tip}
    >
      {browser.name}: {browser.ok ? "ok" : "not ready"}
      {ownerMode ? ", this phone" : ""}
    </span>
  );

  if (!consentOk) {
    return (
      <div
        className={
          embedded
            ? "rounded-2xl border border-white/10 bg-[#16181F] p-4 text-sm text-[#C9CCD3]"
            : "rounded-2xl border border-ink/10 bg-white p-4 text-sm text-muted"
        }
        role="status"
      >
        Text-only mode for this person. This device does not record. Use the
        session text chat or have someone with consent record the room.
      </div>
    );
  }

  if (embedded) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm text-[#C9CCD3]">
        {badge}
        {error ? (
          <span className="text-[#F87171]" role="alert">
            {error}
          </span>
        ) : null}
        {statusLine ? <span className="text-[#E8C36A]">{statusLine}</span> : null}
        {!recording ? (
          <button
            type="button"
            disabled={disabled || !browser.ok}
            onClick={() => void start()}
            className="h-11 rounded-xl border border-[#3B404A] px-4 font-semibold text-[#F2F3F5]"
          >
            Start recording
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void stop()}
            className="h-11 rounded-xl border border-[#3B404A] px-4 font-semibold text-[#F2F3F5]"
          >
            Stop recording
          </button>
        )}
        <span className="font-mono text-xs text-[#8C929D]">
          {chunks} parts saved
          {pendingUploads > 0 ? `, ${pendingUploads} uploading` : ""}
          {", next #"}
          {nextIndex}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-ink/10 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-display text-lg font-semibold">Recording</p>
          <p className="text-xs text-muted">
            Saves every ~10 seconds. A crash loses at most one unfinished part.
            Next part #{nextIndex}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {badge}
          {recording ? (
            <span className="inline-flex items-center gap-2 rounded-xl bg-cardinal/10 px-3 py-1 text-xs font-medium text-cardinal">
              <span className="h-2 w-2 animate-pulse rounded-full bg-cardinal" />
              Recording
            </span>
          ) : null}
        </div>
      </div>
      {error ? (
        <p className="text-sm text-cardinal" role="alert">
          {error}
        </p>
      ) : null}
      {statusLine ? <p className="text-sm text-muted">{statusLine}</p> : null}
      <p className="text-sm text-muted">
        {chunks} chunks uploaded
        {pendingUploads > 0 ? ` (${pendingUploads} still uploading)` : ""}
      </p>
      <div className="flex gap-2">
        {!recording ? (
          <button
            type="button"
            disabled={disabled || !browser.ok}
            onClick={() => void start()}
            className="h-11 rounded-xl bg-cardinal px-4 text-sm font-bold text-white"
          >
            Start recording
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void stop()}
            className="h-11 rounded-xl border border-ink/15 px-4 text-sm font-semibold"
          >
            Stop
          </button>
        )}
      </div>
    </div>
  );
}
