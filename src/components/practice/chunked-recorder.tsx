"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const CHUNK_MS = 30_000;

type Props = {
  roundId: string;
  onStopped?: (info: { chunksUploaded: number }) => void;
  disabled?: boolean;
};

/**
 * Browser MediaRecorder uploading 30s chunks as they complete.
 * A crash loses at most the current unfinished chunk (~30s).
 */
export function ChunkedRecorder({ roundId, onStopped, disabled }: Props) {
  const [recording, setRecording] = useState(false);
  const [chunks, setChunks] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [nextIndex, setNextIndex] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const indexRef = useRef(0);

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
    };
  }, [roundId]);

  async function uploadChunk(blob: Blob, index: number) {
    const form = new FormData();
    form.append("chunk", blob, `chunk-${index}.webm`);
    form.append("index", String(index));
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : undefined,
      });
      mediaRef.current = recorder;
      recorder.ondataavailable = (ev) => {
        if (ev.data.size === 0) return;
        const idx = indexRef.current;
        indexRef.current += 1;
        void uploadChunk(ev.data, idx);
      };
      recorder.start(CHUNK_MS);
      setRecording(true);
    } catch {
      setError("Microphone permission needed to record.");
    }
  }

  function stop() {
    mediaRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setRecording(false);
    onStopped?.({ chunksUploaded: chunks });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-ink/10 bg-white/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-display text-lg font-semibold">Recording</p>
          <p className="text-xs text-muted">
            30s chunks · max loss {CHUNK_MS / 1000}s · next #{nextIndex}
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
          <Button type="button" disabled={disabled} onClick={() => void start()}>
            Start recording
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={stop}>
            Stop
          </Button>
        )}
      </div>
    </div>
  );
}
