"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChunkedRecorder } from "@/components/practice/chunked-recorder";
import { DrillShell } from "@/components/practice/drill-shell";
import { speakText, stopSpeaking } from "@/lib/practice/speech";
import { useDrillSession } from "../use-drill-session";

type Kind = { id: string; label: string };
type Member = { id: string; name: string };
type Assignment = { question_kind: string; person_id: string };

export default function QaRoutingPage() {
  const { session, start, error, busy } = useDrillSession();
  const [kinds, setKinds] = useState<Kind[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [checkKind, setCheckKind] = useState("facts");
  const [checkResult, setCheckResult] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);

  async function loadRouting() {
    const res = await fetch("/api/practice/drills/qa-routing");
    const data = (await res.json()) as {
      kinds: Kind[];
      members: Member[];
      assignments: Assignment[];
    };
    setKinds(data.kinds ?? []);
    setMembers(data.members ?? []);
    const map: Record<string, string> = {};
    for (const a of data.assignments ?? []) {
      map[a.question_kind] = a.person_id;
    }
    setAssignments(map);
  }

  useEffect(() => {
    void (async () => {
      await start("qa_routing");
      await loadRouting();
    })();
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(kind: string, personId: string) {
    setAssignments((a) => ({ ...a, [kind]: personId }));
    const res = await fetch("/api/practice/drills/qa-routing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "save",
        questionKind: kind,
        personId,
      }),
    });
    setMsg(res.ok ? "Saved." : "Could not save.");
  }

  async function check() {
    if (!session?.roundId) return;
    const res = await fetch("/api/practice/drills/qa-routing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "check",
        questionKind: checkKind,
        roundId: session.roundId,
      }),
    });
    const data = (await res.json()) as {
      expectedName?: string | null;
      matched?: boolean | null;
    };
    if (data.matched == null) {
      setCheckResult("No routing set for this kind yet.");
      return;
    }
    setCheckResult(
      data.matched
        ? `Matched: ${data.expectedName ?? "teammate"} took this kind.`
        : `Miss: expected ${data.expectedName ?? "someone else"} for this kind.`,
    );
    speakText(
      data.matched
        ? "Right person answered."
        : "Wrong person answered for this question kind.",
    );
  }

  return (
    <DrillShell
      eyebrow="Q&A ROUTING"
      subtitle="Each team sets who takes which kind of judge question. Reports check it."
      recording={recording}
    >
      {busy ? <p className="text-sm text-[#8C929D]">Starting…</p> : null}
      {error ? <p className="text-sm text-[#C62828]">{error}</p> : null}

      <section className="space-y-3 rounded-2xl bg-[#16181F] p-4">
        <h2 className="m-0 text-base font-bold">Who takes which kind</h2>
        {members.length === 0 ? (
          <p className="text-sm text-[#8C929D]">
            No teammates on your roster yet.
          </p>
        ) : (
          kinds.map((k) => (
            <label key={k.id} className="flex flex-col gap-1 text-sm">
              {k.label}
              <select
                className="h-[42px] rounded-xl border border-[#3B404A] bg-[#0C0D11] px-3"
                value={assignments[k.id] ?? ""}
                onChange={(e) => void save(k.id, e.target.value)}
              >
                <option value="">Nobody yet</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          ))
        )}
        {msg ? <p className="text-xs text-[#8C929D]">{msg}</p> : null}
      </section>

      <section className="space-y-3 rounded-2xl bg-[#16181F] p-4">
        <h2 className="m-0 text-base font-bold">Practice check</h2>
        <p className="text-sm text-[#8C929D]">
          Record an answer, then check whether the routed person spoke.
        </p>
        <label className="flex flex-col gap-1 text-sm">
          Question kind
          <select
            className="h-[42px] rounded-xl border border-[#3B404A] bg-[#0C0D11] px-3"
            value={checkKind}
            onChange={(e) => setCheckKind(e.target.value)}
          >
            {kinds.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
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
          className="h-[46px] rounded-xl bg-[#F2F3F5] px-4 text-sm font-semibold text-[#0C0D11]"
          onClick={() => void check()}
        >
          Check routing for this answer
        </button>
        {checkResult ? (
          <p className="text-sm text-[#C9CCD3]">{checkResult}</p>
        ) : null}
      </section>

      <Link href="/practice" className="text-sm text-[#8C929D] underline">
        Back to practice
      </Link>
    </DrillShell>
  );
}
