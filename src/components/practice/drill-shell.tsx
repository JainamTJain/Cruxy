"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  eyebrow: string;
  subtitle?: string;
  recording?: boolean;
  children: ReactNode;
  footer?: ReactNode;
};

/** Phone-first dark shell shared by practice drills. */
export function DrillShell({
  eyebrow,
  subtitle,
  recording,
  children,
  footer,
}: Props) {
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-[#0C0D11] text-[#F2F3F5]">
      <div className="mx-auto flex min-h-full w-full max-w-[390px] flex-col gap-4 px-[18px] py-[18px]">
        <div className="flex items-center justify-between">
          <Link
            href="/practice"
            className="inline-flex min-h-11 items-center font-display text-[26px] font-extrabold tracking-[-0.03em]"
            aria-label="Back to practice"
          >
            crux
          </Link>
          {recording ? (
            <span className="flex min-h-11 items-center gap-1.5 text-xs font-bold text-[#C62828]">
              <span className="h-2 w-2 rounded-full bg-[#C62828]" />
              REC
            </span>
          ) : (
            <Link
              href="/practice"
              className="inline-flex min-h-11 items-center text-sm text-[#C9CCD3]"
            >
              Exit
            </Link>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold tracking-[0.1em] text-gold">
            {eyebrow}
          </span>
          {subtitle ? (
            <span className="text-[13px] text-[#C9CCD3]">{subtitle}</span>
          ) : null}
        </div>
        <div className="flex flex-1 flex-col gap-4">{children}</div>
        {footer}
      </div>
    </div>
  );
}
