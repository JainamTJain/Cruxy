"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChunkedRecorder } from "@/components/practice/chunked-recorder";

type Round = {
  id: string;
  session_id: string;
  mode: string;
  phase: string;
  case_number: number | null;
  judges: { humans: string[]; cruxy: boolean };
  timings: {
    presentation_max: number;
    commentary_max: number;
    qa_max: number;
  };
  sides: { presenting: string | null; commenting: string | null };
};

export default function RoundPage() {
  const params = useParams<{ id: string }>();
  const [round, setRound] = useState<Round | null>(null);
  const [recording, setRecording] = useState<{
    chunks: number;
    deleted_at: string | null;
    status: string;
  } | null>(null);
  const [lines, setLines] = useState<
    { id: string; start_ms: number; text: string; speaker_label: string | null }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [clock, setClock] = useState(0);
  const [ticking, setTicking] = useState(false);

  async function refresh() {
    const res = await fetch(`/api/practice/rounds/${params.id}`);
    const data = await res.json();
    if (res.ok) {
      setRound(data.round);
      setRecording(data.recording);
      setLines(data.lines ?? []);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setClock((c) => c + 1), 1000);
    return () => clearInterval(id);
  }, [ticking]);

  async function start() {
    await fetch(`/api/practice/rounds/${params.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
    setClock(0);
    setTicking(true);
    await refresh();
  }

  async function nextPhase(phase: string) {
    await fetch(`/api/practice/rounds/${params.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "phase", phase }),
    });
    await refresh();
  }

  async function finalize() {
    setBusy(true);
    setResult(null);
    const res = await fetch(`/api/practice/rounds/${params.id}/finalize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    setBusy(false);
    setTicking(false);
    if (!res.ok) {
      setResult(data.error ?? "Finalize failed");
      return;
    }
    setResult(
      `Transcript ${data.lineCount} lines · audio deleted: ${data.audioDeleted} · Cruxy cards: ${data.cruxyCards}`,
    );
    await refresh();
  }

  if (!round) {
    return <p className="text-sm text-muted">Loading round…</p>;
  }

  const hardStop =
    round.timings.presentation_max * 60 +
    (round.sides.commenting ? round.timings.commentary_max * 60 : 0);

  return (
    <main className="animate-fade-up space-y-6">
      {recording && !recording.deleted_at && recording.status === "recording" ? (
        <div className="fixed inset-x-0 top-0 z-30 bg-cardinal px-3 py-2 text-center text-xs font-medium text-white">
          Recording — red bar on every screen
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">
            {round.mode} · phase {round.phase}
          </p>
          <h1 className="font-display text-3xl font-semibold">
            Case {round.case_number ?? "—"}
          </h1>
        </div>
        <div className="rounded-xl bg-ink px-4 py-2 font-mono text-lg text-gold">
          {Math.floor(clock / 60)}:{String(clock % 60).padStart(2, "0")}
          {ticking && clock >= hardStop ? (
            <span className="ml-2 text-cardinal">that&apos;s time</span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void start()}>
          Start round
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void nextPhase("commentary")}
        >
          Next: commentary
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void nextPhase("judges_qa")}
        >
          Next: judges Q&A
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => void finalize()}
        >
          {busy ? "Transcribing…" : "End · transcript · judge"}
        </Button>
      </div>

      <ChunkedRecorder roundId={params.id} />

      {result ? (
        <p className="rounded-xl border border-ink/10 bg-white/70 px-3 py-2 text-sm">
          {result}
        </p>
      ) : null}

      {recording?.deleted_at ? (
        <p className="text-sm text-muted">
          Audio deleted at {new Date(recording.deleted_at).toLocaleString()}. Only text
          remains.
        </p>
      ) : null}

      {lines.length > 0 ? (
        <section className="rounded-2xl border border-ink/10 bg-white/70 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Transcript</h2>
            <Link
              href={`/practice/rounds/${params.id}/report`}
              className="text-sm text-cardinal underline"
            >
              Open report
            </Link>
          </div>
          <ul className="max-h-80 space-y-2 overflow-y-auto text-sm">
            {lines.map((l) => (
              <li key={l.id} className="border-b border-ink/5 pb-2">
                <span className="font-mono text-xs text-muted">
                  {l.speaker_label ?? "?"} @{(l.start_ms / 1000).toFixed(1)}s
                </span>
                <p>{l.text}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-sm">
        <Link href={`/practice/sessions/${round.session_id}`} className="underline">
          Back to session
        </Link>
        {" · "}
        <Link href="/judging" className="underline">
          Judging portal
        </Link>
      </p>
    </main>
  );
}
