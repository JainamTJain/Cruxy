"use client";

import { useEffect, useRef, useState } from "react";
import { emitMood, subscribeMood } from "@/components/cruxy/mood/bus";
import { usePrefersReducedMotion } from "@/components/motion/reduced-motion";

type Piece = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  color: string;
  w: number;
  h: number;
};

const COLORS = ["#9D2235", "#2F7FE0", "#E8B84A", "#0F7B6C", "#4F46E5"];

/**
 * Mount once near the shell. Short burst on roadmap.stage_done / milestone.
 * requestAnimationFrame only; nothing under prefers-reduced-motion.
 */
export function ConfettiHost() {
  const reduced = usePrefersReducedMotion();
  const [pieces, setPieces] = useState<Piece[]>([]);
  const raf = useRef<number | null>(null);
  const burstId = useRef(0);

  useEffect(() => {
    if (reduced) return;
    return subscribeMood((event, mapped) => {
      if (!mapped.confetti) return;
      if (event.type !== "roadmap.stage_done" && event.type !== "milestone") {
        return;
      }
      const next: Piece[] = [];
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight * 0.28;
      const idBase = ++burstId.current * 1000;
      for (let i = 0; i < 36; i++) {
        const angle = (Math.PI * 2 * i) / 36 + Math.random() * 0.4;
        const speed = 3.5 + Math.random() * 4;
        next.push({
          id: idBase + i,
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2,
          rot: Math.random() * 360,
          vr: (Math.random() - 0.5) * 12,
          color: COLORS[i % COLORS.length]!,
          w: 6 + Math.random() * 5,
          h: 8 + Math.random() * 6,
        });
      }
      setPieces(next);
    });
  }, [reduced]);

  useEffect(() => {
    if (!pieces.length || reduced) return;
    const start = performance.now();
    let current = pieces;
    const tick = (now: number) => {
      const elapsed = now - start;
      current = current.map((p) => ({
        ...p,
        x: p.x + p.vx,
        y: p.y + p.vy,
        vy: p.vy + 0.18,
        rot: p.rot + p.vr,
      }));
      setPieces(current);
      if (elapsed < 1100) {
        raf.current = requestAnimationFrame(tick);
      } else {
        setPieces([]);
      }
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // Only re-run when a new burst id appears (first piece id bucket).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces[0]?.id, reduced]);

  if (!pieces.length) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[60] overflow-hidden"
      aria-hidden
    >
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute block rounded-[2px]"
          style={{
            left: p.x,
            top: p.y,
            width: p.w,
            height: p.h,
            background: p.color,
            transform: `rotate(${p.rot}deg)`,
          }}
        />
      ))}
    </div>
  );
}

/** Imperative helper for pages that finish a stage. */
export function burstConfetti(): void {
  emitMood({ type: "roadmap.stage_done" });
}
