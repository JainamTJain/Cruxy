"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const SECONDS = 20;

export function VoiceSampleRecorder({
  onReady,
}: {
  onReady: (blob: Blob | null) => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(SECONDS);
  const [recording, setRecording] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      mediaRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunks.current, { type: "audio/webm" });
        onReady(blob);
        setDone(true);
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRef.current = rec;
      rec.start(1000);
      setRecording(true);
      setSecondsLeft(SECONDS);
      timerRef.current = window.setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            if (timerRef.current) window.clearInterval(timerRef.current);
            rec.stop();
            setRecording(false);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } catch {
      setError("Microphone unavailable. You can still continue text-only.");
      onReady(null);
    }
  }

  function skip() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    mediaRef.current?.stop();
    setRecording(false);
    onReady(null);
    setDone(true);
  }

  return (
    <div className="rounded-2xl border border-ink/10 bg-white/60 p-4">
      <p className="text-sm text-muted">
        Optional 20-second voice sample so transcripts can label your lines.
      </p>
      <div className="mt-3 flex items-center gap-3">
        {!done ? (
          <>
            <Button type="button" onClick={() => void start()} disabled={recording}>
              {recording ? `Recording… ${secondsLeft}s` : "Record voice sample"}
            </Button>
            <Button type="button" variant="ghost" onClick={skip} disabled={recording}>
              Skip for now
            </Button>
          </>
        ) : (
          <p className="text-sm font-medium text-ink">Voice sample saved for this device.</p>
        )}
      </div>
      {error ? <p className="mt-2 text-sm text-cardinal">{error}</p> : null}
    </div>
  );
}
