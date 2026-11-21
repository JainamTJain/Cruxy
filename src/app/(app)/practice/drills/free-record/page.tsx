"use client";

import { useEffect, useState } from "react";
import { ChunkedRecorder } from "@/components/practice/chunked-recorder";
import { DrillShell } from "@/components/practice/drill-shell";
import { useDrillSession } from "../use-drill-session";

export default function FreeRecordPage() {
  const { session, start, error, busy } = useDrillSession();
  const [recording, setRecording] = useState(false);
  const [ideas, setIdeas] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);

  useEffect(() => {
    void start("free_record");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pullIdeas() {
    if (!session?.roundId) return;
    setExtracting(true);
    setMsg(null);
    const res = await fetch("/api/practice/drills/free-record", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roundId: session.roundId }),
    });
    const data = (await res.json()) as {
      created?: number;
      ideas?: string[];
      error?: string;
    };
    setExtracting(false);
    if (!res.ok) {
      setMsg(data.error ?? "Could not pull ideas.");
      return;
    }
    setIdeas(data.ideas ?? []);
    setMsg(
      data.created
        ? `Saved ${data.created} idea(s) to your Truth Sources queue.`
        : "No clear ideas in the transcript yet. Keep talking, then try again after finalize.",
    );
  }

  return (
    <DrillShell
      eyebrow={`FREE RECORD${
        session?.caseNumber != null ? `, CASE ${session.caseNumber}` : ""
      }`}
      subtitle="Record any discussion. Cruxy pulls ideas into Truth Sources."
      recording={recording}
    >
      {busy ? <p className="text-sm text-[#8C929D]">Starting…</p> : null}
      {error ? <p className="text-sm text-[#C62828]">{error}</p> : null}
      <p className="text-sm text-[#C9CCD3]">
        Consent first if you have not. Audio is deleted once the transcript is
        saved. Empty transcripts stay empty; we never invent quotes.
      </p>
      {session?.roundId ? (
        <ChunkedRecorder
          roundId={session.roundId}
          embedded
          consentOk={session.recordingOk}
          onRecordingChange={setRecording}
        />
      ) : null}
      <button
        type="button"
        disabled={extracting || !session?.roundId}
        className="h-[46px] rounded-xl bg-[#F2F3F5] px-4 text-sm font-semibold text-[#0C0D11] disabled:opacity-50"
        onClick={() => void pullIdeas()}
      >
        {extracting ? "Pulling ideas…" : "Pull ideas for Truth Sources"}
      </button>
      {msg ? <p className="text-sm text-[#8C929D]">{msg}</p> : null}
      {ideas.length > 0 ? (
        <ul className="space-y-2 text-sm text-[#C9CCD3]">
          {ideas.map((idea) => (
            <li
              key={idea}
              className="rounded-xl border border-[#262934] bg-[#16181F] px-3 py-2"
            >
              {idea}
            </li>
          ))}
        </ul>
      ) : null}
    </DrillShell>
  );
}
