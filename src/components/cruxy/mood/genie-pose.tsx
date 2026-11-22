"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/components/motion/reduced-motion";
import {
  GENIE_FIGURE_DESKTOP,
  POSE_ASPECT,
  POSE_HEIGHT,
  POSE_WIDTH,
  poseSrc,
  type CruxyPose,
} from "@/components/cruxy/mood/poses";

type Props = {
  pose: CruxyPose | string;
  /**
   * Width in CSS pixels; height follows 273:557.
   * Capped at GENIE_FIGURE_DESKTOP so no pose renders larger than the
   * floating Genie (Wave 8 J).
   */
  width: number;
  className?: string;
  imgClassName?: string;
  alt?: string;
  priority?: boolean;
  /**
   * When true, allow widths above the floating figure cap (drawer chrome,
   * landing heroes). Default false: never larger than GENIE_FIGURE_DESKTOP.
   */
  uncapped?: boolean;
};

/**
 * Soft cross-fade between poses. Keeps real proportions (273 by 557).
 * Figure width is capped at GENIE_FIGURE_DESKTOP unless `uncapped`.
 */
export function GeniePose({
  pose,
  width,
  className,
  imgClassName,
  alt = "",
  priority,
  uncapped = false,
}: Props) {
  const reduced = usePrefersReducedMotion();
  const src = poseSrc(pose);
  const [shown, setShown] = useState(src);
  const [incoming, setIncoming] = useState<string | null>(null);
  const capped = uncapped
    ? width
    : Math.min(width, GENIE_FIGURE_DESKTOP);
  const height = Math.round(capped * POSE_ASPECT);

  useEffect(() => {
    if (src === shown) return;
    if (reduced) {
      setShown(src);
      setIncoming(null);
      return;
    }
    setIncoming(src);
    const t = window.setTimeout(() => {
      setShown(src);
      setIncoming(null);
    }, 280);
    return () => window.clearTimeout(t);
  }, [src, shown, reduced]);

  return (
    <span
      className={cn("relative inline-block overflow-visible", className)}
      style={{ width: capped, height }}
    >
      <Image
        src={shown}
        alt={alt}
        width={POSE_WIDTH}
        height={POSE_HEIGHT}
        className={cn(
          "pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity duration-[280ms] ease-out",
          incoming ? "opacity-0" : "opacity-100",
          imgClassName,
        )}
        draggable={false}
        unoptimized
        priority={priority}
      />
      {incoming ? (
        <Image
          src={incoming}
          alt=""
          width={POSE_WIDTH}
          height={POSE_HEIGHT}
          className={cn(
            "pointer-events-none absolute inset-0 h-full w-full object-contain animate-genie-crossfade",
            imgClassName,
          )}
          draggable={false}
          unoptimized
        />
      ) : null}
    </span>
  );
}
