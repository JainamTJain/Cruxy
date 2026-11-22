"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

type Props = {
  caseId?: string | null;
  className?: string;
  compact?: boolean;
};

/** Morning-of CTA into the existing 10-minute warm-up. */
export function PreRoundWarmupCta({ caseId, className, compact }: Props) {
  const href = caseId
    ? `/revision/warmup?caseId=${encodeURIComponent(caseId)}`
    : "/revision/warmup";

  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center rounded-xl border border-ink/15 bg-white font-semibold text-ink",
        compact ? "h-10 px-4 text-sm" : "h-12 w-full px-5 text-[15px]",
        className,
      )}
    >
      {compact ? "Warm-up" : "10-minute warm-up"}
    </Link>
  );
}
