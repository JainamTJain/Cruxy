"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/components/motion/reduced-motion";

type Props = {
  value: number;
  /** Duration in ms. Default 700. */
  duration?: number;
  className?: string;
  /** Format the displayed integer. */
  format?: (n: number) => string;
};

/** Count from 0 to value on first view (IntersectionObserver + rAF). */
export function CountUp({
  value,
  duration = 700,
  className,
  format = (n) => String(n),
}: Props) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(reduced ? value : 0);
  const started = useRef(false);

  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    const el = ref.current;
    if (!el) return;

    const run = () => {
      if (started.current) return;
      started.current = true;
      const from = 0;
      const to = value;
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - (1 - t) ** 3;
        setShown(Math.round(from + (to - from) * eased));
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) run();
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value, duration, reduced]);

  // If value changes after first run, snap
  useEffect(() => {
    if (started.current) setShown(value);
  }, [value]);

  return (
    <span ref={ref} className={className}>
      {format(shown)}
    </span>
  );
}
