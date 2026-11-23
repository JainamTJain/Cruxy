"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageIntro } from "@/components/page-intro";
import { SOLO_PART_LABELS, type SoloPartId } from "@/lib/team/solo-prep";

type Recording = {
  id: string;
  person_id: string;
  case_id: string;
  part: SoloPartId;
  title: string;
  duration_ms: number | null;
  created_at: string;
};

type Comment = {
  id: string;
  author_id: string;
  author_name?: string;
  body: string;
  at_ms: number;
  created_at: string;
};

function formatAt(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function SoloReviewPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [recording, setRecording] = useState<Recording | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [atMs, setAtMs] = useState(0);
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recordingLocal, setRecordingLocal] = useState(false);
  const [mediaSupported, setMediaSupported] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const res = await fetch(`/api/prepare/recordings/${id}`);
    if (!res.ok) {
      setStatus("Could not load this recording.");
      return;
    }
    const data = (await res.json()) as {
      recording?: Recording;
      comments?: Comment[];
      meId?: string;
    };
    setRecording(data.recording ?? null);
    setComments(data.comments ?? []);
    setMeId(data.meId ?? null);
  }, [id]);

  useEffect(() => {
    void load();
    setMediaSupported(
      typeof window !== "undefined" &&
        typeof MediaRecorder !== "undefined" &&
        Boolean(navigator.mediaDevices?.getUserMedia),
    );
  }, [load]);

  useEffect(() => {
    if (!recordingLocal) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [recordingLocal]);

  async function postComment() {
    if (!id || !body.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/prepare/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recordingId: id,
          body,
          atMs,
        }),
      });
      if (!res.ok) {
        setStatus("Could not save comment.");
        return;
      }
      setBody("");
      setStatus(
        recording && meId && recording.person_id !== meId
          ? "Comment saved. The owner gets a notice."
          : "Comment saved.",
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function markDuration() {
    if (!recording) return;
    setBusy(true);
    try {
      // Re-create is not needed; duration is advisory for timed comments.
      // Persist via a lightweight comment-less update is not available;
      // set local duration for the comment slider.
      setStatus(
        `Marked length at ${formatAt(elapsed * 1000)}. Leave timed comments below.`,
      );
      if (recording.duration_ms == null) {
        setRecording({ ...recording, duration_ms: elapsed * 1000 });
      }
    } finally {
      setBusy(false);
    }
  }

  async function startLocalRecord() {
    if (!mediaSupported) {
      setStatus("This browser cannot record. Leave timed comments from notes.");
      return;
    }
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setElapsed(0);
      setRecordingLocal(true);
      setStatus("Recording locally. Stop when you finish your part.");
    } catch {
      setStatus("Microphone permission needed to record.");
    }
  }

  function stopLocalRecord() {
    setRecordingLocal(false);
    setAtMs(elapsed * 1000);
    void markDuration();
  }

  if (!recording && !status) {
    return <p className="text-sm text-muted">Loading review…</p>;
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 animate-fade-up pb-10">
      <PageIntro
        eyebrow="Async review"
        title={recording?.title ?? "Review"}
      >
        Leave comments tied to a moment. The person who recorded gets a notice
        when someone else comments.
      </PageIntro>

      <Link
        href="/prepare"
        className="text-sm font-semibold text-cardinal underline-offset-2 hover:underline"
      >
        Back to my part
      </Link>

      {status ? <p className="m-0 text-sm text-muted">{status}</p> : null}

      {recording ? (
        <section className="flex flex-col gap-3 rounded-[20px] bg-white p-5">
          <p className="m-0 text-sm text-muted">
            {SOLO_PART_LABELS[recording.part]}, recorded{" "}
            {new Date(recording.created_at).toLocaleString()}
            {recording.duration_ms != null
              ? `, about ${formatAt(recording.duration_ms)}`
              : ""}
          </p>

          {recording.person_id === meId ? (
            <div className="flex flex-wrap gap-2">
              {!recordingLocal ? (
                <button
                  type="button"
                  onClick={() => void startLocalRecord()}
                  className="min-h-11 rounded-xl bg-ink px-4 text-sm font-semibold text-white"
                >
                  Record my part
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopLocalRecord}
                  className="min-h-11 rounded-xl bg-[#C62828] px-4 text-sm font-semibold text-white"
                >
                  Stop ({formatAt(elapsed * 1000)})
                </button>
              )}
            </div>
          ) : (
            <p className="m-0 text-sm text-muted">
              Jump to a moment and leave a note for the speaker.
            </p>
          )}

          <div className="flex flex-col gap-2 border-t border-[#ECEEF1] pt-3">
            <label className="text-xs font-semibold text-muted">
              Moment (seconds)
              <input
                type="number"
                min={0}
                className="mt-1 min-h-11 w-full rounded-xl border border-mist px-3 text-sm"
                value={Math.floor(atMs / 1000)}
                onChange={(e) =>
                  setAtMs(Math.max(0, Number(e.target.value) || 0) * 1000)
                }
              />
            </label>
            <label className="text-xs font-semibold text-muted">
              Comment
              <textarea
                className="mt-1 min-h-[80px] w-full rounded-2xl border border-mist p-3 text-sm"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="What worked, what to fix, one clear next step."
                maxLength={800}
              />
            </label>
            <button
              type="button"
              disabled={busy || !body.trim()}
              onClick={() => void postComment()}
              className="min-h-11 w-fit rounded-xl bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              Leave comment at {formatAt(atMs)}
            </button>
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-2 rounded-[20px] bg-white p-5">
        <h2 className="font-display m-0 text-lg font-extrabold">
          Timed comments
        </h2>
        {!comments.length ? (
          <p className="m-0 text-sm text-muted">
            No comments yet. Teammates and Dr. B can leave them any time.
          </p>
        ) : (
          <ul className="m-0 list-none divide-y divide-[#ECEEF1] p-0">
            {comments.map((c) => (
              <li key={c.id} className="py-3 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">
                    {c.author_name ?? "Teammate"}
                  </span>
                  <button
                    type="button"
                    className="font-mono text-xs font-semibold text-cardinal"
                    onClick={() => setAtMs(c.at_ms)}
                  >
                    @{formatAt(c.at_ms)}
                  </button>
                </div>
                <p className="m-0 mt-1 text-muted">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
