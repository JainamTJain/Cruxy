"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

type Props = {
  caseId?: string | null;
  roundId?: string | null;
  nextHref?: string | null;
  className?: string;
  compact?: boolean;
};

/** Optional entry into the Wave 9 J calm routine. Never required. */
export function PreRoundCalmCta({
  caseId,
  roundId,
  nextHref,
  className,
  compact,
}: Props) {
  const q = new URLSearchParams();
  if (caseId) q.set("caseId", caseId);
  if (roundId) q.set("roundId", roundId);
  if (nextHref) q.set("next", nextHref);
  const href = `/calm${q.toString() ? `?${q.toString()}` : ""}`;

  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center rounded-xl border border-ink/15 bg-ink font-semibold text-white",
        compact ? "h-10 px-4 text-sm" : "h-12 w-full px-5 text-[15px]",
        className,
      )}
    >
      {compact ? "Calm minute" : "Calm minute before the round"}
    </Link>
  );
}
