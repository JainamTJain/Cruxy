"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CruxWordmark } from "@/components/crux-wordmark";
import { Button } from "@/components/ui/button";
import { VoiceEnrollment } from "@/components/voice-enrollment";
import { CRUXY_PLAIN_WORDS } from "@/lib/types";
import type { EnrollmentPartId } from "@/lib/voice/types";

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
    "About 45 to 60 seconds in three short parts so Crux can tell who said what in a crowded room.",
  ],
  ["Who sees it", "Your team, Dr. B and Jainam. Other teams do not see your work. Nobody else."],
  [
    "Where it goes",
    "Audio is stored briefly in Crux, then deleted once the transcript is saved.",
  ],
  [
    "How long",
    "Audio is deleted once the transcript is saved. Transcripts stay for the season.",
  ],
];

export default function ConsentPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<"intro" | "enroll">("intro");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function postConsent(recordingOk: boolean) {
    const res = await fetch("/api/auth/consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recordingOk }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      throw new Error(data.error ?? "Could not save consent.");
    }
  }

  async function saveWithVoice(payload: {
    parts: Record<EnrollmentPartId, Blob>;
    heardText: string;
  }) {
    setBusy(true);
    setError(null);
    try {
      await postConsent(true);
      const form = new FormData();
      for (const id of ["read", "natural", "competition"] as EnrollmentPartId[]) {
        const blob = payload.parts[id];
        const ext = blob.type.includes("mp4") ? "mp4" : "webm";
        form.set(id, blob, `${id}.${ext}`);
      }
      form.set("heardText", payload.heardText);
      const enroll = await fetch("/api/voice/enroll", {
        method: "POST",
        body: form,
      });
      const data = (await enroll.json()) as { error?: string; ok?: boolean };
      if (!enroll.ok) {
        throw new Error(data.error ?? "Voice enrollment did not pass. Redo the flagged parts.");
      }
      router.push("/learning-profile");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save consent.");
      setBusy(false);
    }
  }

  async function notNow() {
    setBusy(true);
    setError(null);
    try {
      await postConsent(false);
      router.push("/learning-profile");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save consent.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 py-10 sm:px-8">
      <div className="rounded-2xl bg-ink px-4 py-5">
        <CruxWordmark as="p" className="text-4xl sm:text-5xl" />
      </div>
      <p className="mt-6 text-xs font-bold uppercase tracking-[0.12em] text-muted">
        Step 2 of 4
      </p>
      <p className="text-xs text-muted">First time only</p>
      <h1 className="mt-2 font-display text-3xl font-extrabold text-ink sm:text-4xl">
        Meet Cruxy
      </h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Read what Crux records in practice, then choose a voice sample or stay
        text only. You can change this later in Settings.
      </p>

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

      {phase === "intro" ? (
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button
            disabled={busy}
            onClick={() => {
              setError(null);
              setPhase("enroll");
            }}
            className="sm:flex-1"
          >
            I agree: record my voice sample
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
      ) : (
        <VoiceEnrollment
          busy={busy}
          onDone={(payload) => void saveWithVoice(payload)}
          onCancelTextOnly={() => void notNow()}
        />
      )}

      {error ? <p className="mt-3 text-sm text-cardinal">{error}</p> : null}
    </main>
  );
}
