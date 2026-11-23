"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GeniePose } from "@/components/cruxy/mood/genie-pose";
import { Button } from "@/components/ui/button";
import { genieFigureWidth } from "@/components/cruxy/mood/poses";
import { cn } from "@/lib/utils";

type CalmContext = {
  stance: string | null;
  encouragement: string;
  caseTitle: string | null;
};

type Props = {
  nextHref?: string | null;
  caseId?: string | null;
  roundId?: string | null;
  /** Compact embed on a round setup screen. */
  embedded?: boolean;
  className?: string;
};

/**
 * 60–90s pre-round calm: slow breath pacer, one-line stance, one line of
 * encouragement from the person's own past. Skippable; respects reduced motion.
 * Uses wall-clock so a locked phone does not stall the phases forever.
 */
export function CalmRoutine({
  nextHref,
  caseId,
  roundId,
  embedded,
  className,
}: Props) {
  const router = useRouter();
  const [ctx, setCtx] = useState<CalmContext | null>(null);
  const [phase, setPhase] = useState<"breathe" | "stance" | "encourage">(
    "breathe",
  );
  const [breathIn, setBreathIn] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [done, setDone] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const startedAtRef = useRef<number>(Date.now());
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const figureW = useMemo(
    () =>
      typeof window !== "undefined"
        ? genieFigureWidth(window.innerWidth)
        : 96,
    [],
  );

  useEffect(() => {
    const q = new URLSearchParams();
    if (caseId) q.set("caseId", caseId);
    if (roundId) q.set("roundId", roundId);
    void fetch(`/api/calm/context?${q.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: CalmContext | null) => {
        if (d) setCtx(d);
      })
      .catch(() => undefined);
  }, [caseId, roundId]);

  useEffect(() => {
    if (done || reduced) return;
    startedAtRef.current = Date.now();
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setSeconds(elapsed);
      // Breath flips about every 4s of wall time.
      setBreathIn(Math.floor(elapsed / 4) % 2 === 0);
    };
    tick();
    const id = window.setInterval(tick, 500);
    function wake() {
      tick();
    }
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("pageshow", wake);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("pageshow", wake);
    };
  }, [done, reduced]);

  useEffect(() => {
    if (done) return;
    if (seconds >= 24 && phase === "breathe") setPhase("stance");
    if (seconds >= 48 && phase === "stance") setPhase("encourage");
    if (seconds >= 72) setDone(true);
  }, [seconds, phase, done]);

  async function finish(skipped: boolean) {
    if (finishing) return;
    setFinishing(true);
    try {
      await fetch("/api/calm/log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          caseId: caseId ?? null,
          roundId: roundId ?? null,
          completed: !skipped,
          skipped,
        }),
      }).catch(() => undefined);
      if (nextHref) router.push(nextHref);
    } finally {
      // Keep disabled if we stay on the page after skip without navigation.
      if (!nextHref) setFinishing(false);
    }
  }

  const stance =
    ctx?.stance?.trim() ||
    "Say your team's one-line stance out loud, once.";
  const encouragement =
    ctx?.encouragement?.trim() ||
    "You have already improved from your own past. Trust that.";

  return (
    <section
      className={cn(
        "flex flex-col gap-5 rounded-[20px] bg-ink px-5 py-6 text-white",
        embedded ? "w-full" : "mx-auto w-full max-w-lg",
        className,
      )}
      aria-label="Calm before the round"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/60">
            Calm before the round
          </p>
          <h1 className="font-display mt-1 text-2xl font-extrabold leading-tight">
            {done ? "You are ready" : "One quiet minute"}
          </h1>
          {ctx?.caseTitle ? (
            <p className="mt-1 text-sm text-white/70">{ctx.caseTitle}</p>
          ) : null}
        </div>
        <GeniePose pose={done ? "happy" : "curious"} width={Math.min(figureW, 96)} />
      </div>

      {!done ? (
        <>
          <div className="flex flex-col items-center gap-3 py-2">
            <div
              className={cn(
                "flex h-28 w-28 items-center justify-center rounded-full border-2 border-genie-bright/70 bg-genie/20",
                !reduced && "transition-transform duration-[3800ms] ease-in-out",
                !reduced && (breathIn ? "scale-110" : "scale-90"),
              )}
              aria-hidden
            >
              <span className="text-sm font-semibold text-white/90">
                {reduced ? "Breathe" : breathIn ? "Breathe in" : "Breathe out"}
              </span>
            </div>
            <p className="text-center text-sm text-white/75">
              {phase === "breathe"
                ? "Slow breaths with Cruxy. No rush."
                : phase === "stance"
                  ? "Your team's stance, one line."
                  : "One line from your own progress."}
            </p>
          </div>

          {phase !== "breathe" ? (
            <p className="rounded-2xl bg-white/10 px-4 py-3 text-[15px] leading-snug">
              {phase === "stance" ? stance : encouragement}
            </p>
          ) : null}
        </>
      ) : (
        <p className="rounded-2xl bg-white/10 px-4 py-3 text-[15px] leading-snug">
          {encouragement}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        {done || reduced ? (
          <Button
            type="button"
            className="h-11 min-h-11 bg-gold font-bold text-ink hover:bg-gold/90"
            disabled={finishing}
            onClick={() => void finish(false)}
          >
            {finishing ? "…" : nextHref ? "Continue" : "Done"}
          </Button>
        ) : (
          <Button
            type="button"
            className="h-11 min-h-11 bg-gold font-bold text-ink hover:bg-gold/90"
            disabled={finishing}
            onClick={() => {
              setDone(true);
              setPhase("encourage");
            }}
          >
            I am ready
          </Button>
        )}
        <button
          type="button"
          className="h-11 min-h-11 px-3 text-sm text-white/70 underline disabled:opacity-50"
          disabled={finishing}
          onClick={() => void finish(true)}
        >
          Skip
        </button>
      </div>
    </section>
  );
}
