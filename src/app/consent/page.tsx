"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceSampleRecorder } from "@/components/voice-sample-recorder";
import { CRUXY_PLAIN_WORDS } from "@/lib/types";
import { Button } from "@/components/ui/button";

export default function ConsentPage() {
  const router = useRouter();
  const [voice, setVoice] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(recordingOk: boolean) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("recordingOk", recordingOk ? "true" : "false");
      if (recordingOk && voice) form.set("voice", voice, "sample.webm");
      const res = await fetch("/api/auth/consent", { method: "POST", body: form });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Could not save consent.");
        return;
      }
      router.push("/choose-passcode");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        Step 2 of 3 · first time only
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">
        Meet Cruxy
      </h1>
      <p className="mt-4 text-base leading-relaxed text-ink/90">
        {CRUXY_PLAIN_WORDS}
      </p>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-xl font-semibold">What Crux records</h2>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="font-medium">When</dt>
            <dd className="text-muted">
              Only after someone presses Record in practice. A red bar shows
              while it&apos;s on.
            </dd>
          </div>
          <div>
            <dt className="font-medium">What</dt>
            <dd className="text-muted">
              Audio of the room, turned into a transcript of who said what, and
              when.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Your voice</dt>
            <dd className="text-muted">
              A 20 second sample so the transcript knows which lines are yours.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Who sees it</dt>
            <dd className="text-muted">
              All three teams, Dr. B and Jainam. Nobody else.
            </dd>
          </div>
          <div>
            <dt className="font-medium">How long</dt>
            <dd className="text-muted">
              Audio is deleted once the transcript is saved. Transcripts stay
              for the season.
            </dd>
          </div>
        </dl>
      </section>

      <div className="mt-6">
        <VoiceSampleRecorder onReady={setVoice} />
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button
          disabled={busy}
          onClick={() => void submit(true)}
          className="sm:flex-1"
        >
          I agree: record my voice sample
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void submit(false)}
          className="sm:flex-1"
        >
          Not now, use Crux without being recorded
        </Button>
      </div>
      {error ? <p className="mt-3 text-sm text-cardinal">{error}</p> : null}
    </main>
  );
}
