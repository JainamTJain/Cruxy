"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

type Props = {
  caseId?: string | null;
  className?: string;
  /** Compact for practice hub. */
  compact?: boolean;
};

/** Skip the Practice mode dropdown. Start Judges' Q&A in one tap. */
export function OneTapJudgeDrill({ caseId, className, compact }: Props) {
  const href = caseId
    ? `/practice/drills/judges-qa?caseId=${encodeURIComponent(caseId)}`
    : "/practice/drills/judges-qa";

  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center rounded-xl bg-cardinal font-semibold text-white",
        compact ? "h-10 px-4 text-sm" : "h-12 w-full px-5 text-[15px]",
        className,
      )}
    >
      Judges&apos; Q&A drill
    </Link>
  );
}
