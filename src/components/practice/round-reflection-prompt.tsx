"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  roundId: string;
};

const LIMIT_S = 60;

/**
 * Wave 9 D: ~60 second post-round reflection on the report page.
 */
export function RoundReflectionPrompt({ roundId }: Props) {
  const [wentWell, setWentWell] = useState("");
  const [oneChange, setOneChange] = useState("");
  const [confidence, setConfidence] = useState(50);
  const [secondsLeft, setSecondsLeft] = useState(LIMIT_S);
  const [done, setDone] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const startedAt = useRef(Date.now());
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    void fetch(`/api/practice/rounds/${roundId}/reflection`)
      .then((r) => r.json())
      .then((d: { reflection?: { went_well: string; one_change: string; confidence: number } | null }) => {
        if (d.reflection) {
          setWentWell(d.reflection.went_well);
          setOneChange(d.reflection.one_change);
          setConfidence(d.reflection.confidence);
          setDone(true);
        }
      })
      .catch(() => undefined);
  }, [roundId]);

  useEffect(() => {
    if (done || skipped) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    timerRef.current = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [done, skipped]);

  async function save() {
    setBusy(true);
    setMsg(null);
    const spent = Math.round((Date.now() - startedAt.current) / 1000);
    const res = await fetch(`/api/practice/rounds/${roundId}/reflection`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        wentWell,
        oneChange,
        confidence,
        secondsSpent: spent,
      }),
    });
    const data = (await res.json()) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "Could not save.");
      return;
    }
    setDone(true);
    setMsg("Saved. We will show this back next time you start this case.");
  }

  if (skipped) return null;

  return (
    <section className="rounded-[20px] border border-[#262934] bg-[#16181F] p-5 text-[#F2F3F5]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-base font-bold">Quick reflection</h2>
        {!done ? (
          <span className="font-mono text-xs text-[#8C929D]">
            About {secondsLeft}s
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-[#8C929D]">
        Three short notes for yourself. About a minute. Compared only with your
        own past next time.
      </p>

      {done ? (
        <div className="mt-3 space-y-2 text-sm">
          <p className="m-0">
            <span className="text-[#8C929D]">Went well: </span>
            {wentWell || "(blank)"}
          </p>
          <p className="m-0">
            <span className="text-[#8C929D]">One change: </span>
            {oneChange || "(blank)"}
          </p>
          <p className="m-0">
            <span className="text-[#8C929D]">How sure: </span>
            {confidence}%
          </p>
          {msg ? <p className="m-0 text-[#6EE7B7]">{msg}</p> : null}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">What went well?</span>
            <textarea
              className="min-h-[64px] rounded-xl border border-[#3B404A] bg-[#0C0D11] p-3 text-sm"
              value={wentWell}
              onChange={(e) => setWentWell(e.target.value)}
              maxLength={400}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">One thing to change</span>
            <textarea
              className="min-h-[64px] rounded-xl border border-[#3B404A] bg-[#0C0D11] p-3 text-sm"
              value={oneChange}
              onChange={(e) => setOneChange(e.target.value)}
              maxLength={400}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="flex justify-between font-medium">
              <span>How sure did you feel?</span>
              <span className="font-mono text-xs">{confidence}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={confidence}
              onChange={(e) => setConfidence(Number(e.target.value))}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="bg-[#F2F3F5] text-[#0C0D11] hover:bg-white"
            >
              {busy ? "Saving…" : "Save reflection"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="text-[#C9CCD3]"
              onClick={() => setSkipped(true)}
            >
              Skip for now
            </Button>
          </div>
          {msg ? <p className="m-0 text-sm text-[#F87171]">{msg}</p> : null}
        </div>
      )}
    </section>
  );
}
