"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/components/motion/reduced-motion";
import { GeniePose } from "@/components/cruxy/mood/genie-pose";
import {
  GENIE_FIGURE_DESKTOP,
  LOADING_CYCLE,
  preloadCruxyPoses,
  type CruxyPose,
} from "@/components/cruxy/mood/poses";

type Props = {
  label?: string;
  /** Figure width; default 72. Never above GENIE_FIGURE_DESKTOP. */
  size?: number;
  className?: string;
  /** Compact inline for panels / answers. */
  compact?: boolean;
};

/**
 * Replaces spinners: Genie cycles curious → thinking → excited → winking.
 */
export function LoadingGenie({
  label = "Loading...",
  size = 72,
  className,
  compact,
}: Props) {
  const reduced = usePrefersReducedMotion();
  const [i, setI] = useState(0);

  useEffect(() => {
    preloadCruxyPoses();
  }, []);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      setI((n) => (n + 1) % LOADING_CYCLE.length);
    }, 900);
    return () => window.clearInterval(id);
  }, [reduced]);

  const pose: CruxyPose = reduced ? "curious" : (LOADING_CYCLE[i] ?? "curious");
  const figureW = Math.min(
    compact ? Math.min(size, 56) : size,
    GENIE_FIGURE_DESKTOP,
  );

  return (
    <div
      className={cn(
        "flex items-center gap-3 text-sm text-muted",
        compact ? "flex-row" : "flex-col justify-center py-8",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <GeniePose
        pose={pose}
        width={figureW}
        imgClassName="drop-shadow-[0_8px_14px_rgba(17,19,24,0.18)]"
      />
      <span>{label}</span>
    </div>
  );
}
