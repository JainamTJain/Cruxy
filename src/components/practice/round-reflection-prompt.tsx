"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  roundId: string;
};

const LIMIT_S = 60;

/**
 * Wave 9 D: ~60 second post-round reflection. Built for alone prep: three
 * short fields, timer, save once. The "one change" returns on the next session.
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
  const firstField = useRef<HTMLInputElement>(null);
  const saving = useRef(false);

  useEffect(() => {
    void fetch(`/api/practice/rounds/${roundId}/reflection`)
      .then((r) => r.json())
      .then(
        (d: {
          reflection?: {
            went_well: string;
            one_change: string;
            confidence: number;
          } | null;
        }) => {
          if (d.reflection) {
            setWentWell(d.reflection.went_well);
            setOneChange(d.reflection.one_change);
            setConfidence(d.reflection.confidence);
            setDone(true);
          } else {
            firstField.current?.focus();
          }
        },
      )
      .catch(() => undefined);
  }, [roundId]);

  useEffect(() => {
    if (done || skipped) return;
    const id = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [done, skipped]);

  async function save(auto = false) {
    if (saving.current || done) return;
    const ok =
      wentWell.trim().length >= 3 || oneChange.trim().length >= 3;
    if (!ok) {
      if (!auto) setMsg("One short note is enough.");
      return;
    }
    saving.current = true;
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
    saving.current = false;
    if (!res.ok) {
      setMsg(data.error ?? "Could not save.");
      return;
    }
    setDone(true);
    setMsg(
      auto
        ? "Saved. Your one change will show when you start again."
        : "Saved. We will bring your one change into the next session.",
    );
  }

  useEffect(() => {
    if (secondsLeft === 0 && !done && !skipped) {
      void save(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  if (skipped) return null;

  return (
    <section className="rounded-[20px] border border-[#262934] bg-[#16181F] p-5 text-[#F2F3F5]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-base font-bold">60-second reflection</h2>
        {!done ? (
          <span className="font-mono text-xs text-[#8C929D]">
            {secondsLeft}s
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-[#8C929D]">
        Alone prep: three short lines. Your one change comes back next session.
      </p>

      {done ? (
        <div className="mt-3 space-y-2 text-sm">
          {oneChange ? (
            <p className="m-0 font-semibold">
              <span className="text-gold">Next focus: </span>
              {oneChange}
            </p>
          ) : null}
          {wentWell ? (
            <p className="m-0 text-[#C9CCD3]">Went well: {wentWell}</p>
          ) : null}
          <p className="m-0 text-[#8C929D]">Sure: {confidence}%</p>
          {msg ? <p className="m-0 text-[#6EE7B7]">{msg}</p> : null}
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2.5">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Went well</span>
            <input
              ref={firstField}
              className="rounded-xl border border-[#3B404A] bg-[#0C0D11] px-3 py-2.5 text-sm"
              value={wentWell}
              onChange={(e) => setWentWell(e.target.value)}
              maxLength={160}
              placeholder="One short win"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">One thing to change</span>
            <input
              className="rounded-xl border border-[#3B404A] bg-[#0C0D11] px-3 py-2.5 text-sm"
              value={oneChange}
              onChange={(e) => setOneChange(e.target.value)}
              maxLength={160}
              placeholder="This becomes your next-session focus"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="flex justify-between font-medium">
              <span>How sure</span>
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
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              disabled={busy}
              onClick={() => void save(false)}
              className="bg-[#F2F3F5] text-[#0C0D11] hover:bg-white"
            >
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="text-[#C9CCD3]"
              onClick={() => setSkipped(true)}
            >
              Skip
            </Button>
          </div>
          {msg ? <p className="m-0 text-sm text-[#F87171]">{msg}</p> : null}
        </div>
      )}
    </section>
  );
}
