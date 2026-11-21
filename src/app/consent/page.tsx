"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CRUXY_PLAIN_WORDS } from "@/lib/types";

const ROWS: [string, string][] = [
  [
    "When",
    "Only after someone presses Record in practice. A red bar shows while it's on.",
  ],
  [
    "What",
    "Audio of the room, turned into a transcript of who said what, and when.",
  ],
  [
    "Why",
    "So Cruxy and the team can give feedback that quotes what you said, and so scores stay fair.",
  ],
  [
    "Your voice",
    "A 20 second sample so the transcript knows which lines are yours.",
  ],
  ["Who sees it", "All three teams, Dr. B and Jainam. Nobody else."],
  [
    "Where it goes",
    "Audio is stored briefly in Crux, then deleted once the transcript is saved.",
  ],
  [
    "How long",
    "Audio is deleted once the transcript is saved. Transcripts stay for the season.",
  ],
];

const SAMPLE_MS = 20_000;

export default function ConsentPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  async function postConsent(recordingOk: boolean, voice: Blob | null) {
    const form = new FormData();
    form.set("recordingOk", recordingOk ? "true" : "false");
    if (recordingOk && voice) form.set("voice", voice, "sample.webm");
    const res = await fetch("/api/auth/consent", { method: "POST", body: form });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      throw new Error(data.error ?? "Could not save consent.");
    }
  }

  async function recordSample(): Promise<Blob | null> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      const stopped = new Promise<Blob>((resolve) => {
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          resolve(new Blob(chunks, { type: "audio/webm" }));
        };
      });
      rec.start(500);
      setStatus("Recording voice sample…");
      await new Promise((r) => window.setTimeout(r, SAMPLE_MS));
      if (abortRef.current) {
        rec.stop();
        stream.getTracks().forEach((t) => t.stop());
        return null;
      }
      rec.stop();
      return await stopped;
    } catch {
      setStatus("Microphone unavailable. Saving consent without a sample.");
      return null;
    }
  }

  async function agreeAndRecord() {
    setBusy(true);
    setError(null);
    abortRef.current = false;
    try {
      const voice = await recordSample();
      await postConsent(true, voice);
      router.push("/choose-passcode");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save consent.");
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  async function notNow() {
    setBusy(true);
    setError(null);
    abortRef.current = true;
    try {
      await postConsent(false, null);
      router.push("/choose-passcode");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save consent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 py-10 sm:px-8">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
        Step 2 of 3
      </p>
      <p className="text-xs text-muted">First time only</p>
      <h1 className="mt-2 font-display text-3xl font-extrabold text-ink sm:text-4xl">
        Meet Cruxy
      </h1>

      <div className="mt-6 flex gap-3.5 rounded-2xl border-2 border-genie/30 bg-[#FFF7DB] p-4">
        <Image
          src="/cruxy/cruxy-neutral.png"
          alt=""
          width={64}
          height={64}
          className="h-16 w-16 shrink-0"
          unoptimized
        />
        <p className="text-[15px] leading-relaxed text-ink">{CRUXY_PLAIN_WORDS}</p>
      </div>

      <section className="mt-8 space-y-3">
        <h2 className="text-[15px] font-bold">What Crux records</h2>
        <div className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 text-sm leading-snug">
          {ROWS.map(([k, v]) => (
            <div key={k} className="contents">
              <span className="font-semibold text-muted">{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button
          disabled={busy}
          onClick={() => void agreeAndRecord()}
          className="sm:flex-1"
        >
          I agree to be recorded in practice
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void notNow()}
          className="sm:flex-1"
        >
          Not now: text only
        </Button>
      </div>
      {status ? <p className="mt-3 text-sm text-muted">{status}</p> : null}
      {error ? <p className="mt-3 text-sm text-cardinal">{error}</p> : null}
    </main>
  );
}
