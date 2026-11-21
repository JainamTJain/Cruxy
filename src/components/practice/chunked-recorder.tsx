"use client";

import { useEffect, useRef, useState } from "react";

const CHUNK_MS = 10_000;

type Props = {
  roundId: string;
  onStopped?: (info: { chunksUploaded: number }) => void;
  onRecordingChange?: (recording: boolean) => void;
  disabled?: boolean;
  /** Hide chrome when embedded in the dark practice room. */
  embedded?: boolean;
  autoStart?: boolean;
  consentOk: boolean;
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

/**
 * Browser MediaRecorder uploading 10s chunks (Safari mp4 / Chrome webm).
 * A crash loses at most the current unfinished chunk.
 */
export function ChunkedRecorder({
  roundId,
  onStopped,
  onRecordingChange,
  disabled,
  embedded,
  autoStart,
  consentOk,
}: Props) {
  const [recording, setRecording] = useState(false);
  const [chunks, setChunks] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [nextIndex, setNextIndex] = useState(0);
  const [mime, setMime] = useState<string>("");
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const indexRef = useRef(0);
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null);

  useEffect(() => {
    void fetch(`/api/practice/rounds/${roundId}/chunks`)
      .then((r) => r.json())
      .then((d: { nextIndex?: number; chunks?: number }) => {
        indexRef.current = d.nextIndex ?? 0;
        setNextIndex(d.nextIndex ?? 0);
        setChunks(d.chunks ?? 0);
      })
      .catch(() => undefined);
    return () => {
      mediaRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void wakeRef.current?.release();
    };
  }, [roundId]);

  useEffect(() => {
    if (autoStart && consentOk && !recording && !disabled) {
      void start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, consentOk]);

  async function uploadChunk(blob: Blob, index: number, type: string) {
    const ext = type.includes("mp4") ? "mp4" : "webm";
    const form = new FormData();
    form.append("chunk", blob, `chunk-${index}.${ext}`);
    form.append("index", String(index));
    form.append("mime", type);
    const res = await fetch(`/api/practice/rounds/${roundId}/chunks`, {
      method: "POST",
      body: form,
    });
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      nextIndex?: number;
    };
    if (!res.ok) {
      setError(data.error ?? "Upload failed");
      return;
    }
    setChunks((c) => c + 1);
    setNextIndex(data.nextIndex ?? index + 1);
  }

  async function start() {
    setError(null);
    if (!consentOk) {
      setError("Recording needs consent. Agree on the consent screen first.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      setMime(mimeType ?? "default");
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRef.current = recorder;
      recorder.ondataavailable = (ev) => {
        if (ev.data.size === 0) return;
        const idx = indexRef.current;
        indexRef.current += 1;
        void uploadChunk(ev.data, idx, recorder.mimeType || mimeType || "audio/webm");
      };
      recorder.start(CHUNK_MS);
      setRecording(true);
      onRecordingChange?.(true);
      try {
        // Keep phone screens awake while recording
        const nav = navigator as Navigator & {
          wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> };
        };
        if (nav.wakeLock) {
          wakeRef.current = await nav.wakeLock.request("screen");
        }
      } catch {
        // wake lock optional
      }
    } catch {
      setError("Microphone permission needed to record.");
    }
  }

  function stop() {
    mediaRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    void wakeRef.current?.release();
    setRecording(false);
    onRecordingChange?.(false);
    onStopped?.({ chunksUploaded: chunks });
  }

  if (!consentOk) {
    return (
      <div
        className={
          embedded
            ? "rounded-2xl border border-white/10 bg-[#16181F] p-4 text-sm text-[#C9CCD3]"
            : "rounded-2xl border border-ink/10 bg-white p-4 text-sm text-muted"
        }
      >
        Text-only mode for this person. This device does not record.
      </div>
    );
  }

  if (embedded) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm text-[#C9CCD3]">
        {error ? <span className="text-[#F87171]">{error}</span> : null}
        {!recording ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => void start()}
            className="h-11 rounded-xl border border-[#3B404A] px-4 font-semibold text-[#F2F3F5]"
          >
            Start recording
          </button>
        ) : (
          <button
            type="button"
            onClick={stop}
            className="h-11 rounded-xl border border-[#3B404A] px-4 font-semibold text-[#F2F3F5]"
          >
            Pause mic
          </button>
        )}
        <span className="font-mono text-xs text-[#8C929D]">
          {chunks} chunks · {mime || "…"} · 10s
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
            10s chunks · Safari mp4 / Chrome webm · next #{nextIndex}
          </p>
        </div>
        {recording ? (
          <span className="inline-flex items-center gap-2 rounded-xl bg-cardinal/10 px-3 py-1 text-xs font-medium text-cardinal">
            <span className="h-2 w-2 animate-pulse rounded-full bg-cardinal" />
            Recording
          </span>
        ) : null}
      </div>
      {error ? <p className="text-sm text-cardinal">{error}</p> : null}
      <p className="text-sm text-muted">{chunks} chunks uploaded</p>
      <div className="flex gap-2">
        {!recording ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => void start()}
            className="h-11 rounded-xl bg-cardinal px-4 text-sm font-bold text-white"
          >
            Start recording
          </button>
        ) : (
          <button
            type="button"
            onClick={stop}
            className="h-11 rounded-xl border border-ink/15 px-4 text-sm font-semibold"
          >
            Stop
          </button>
        )}
      </div>
    </div>
  );
}
