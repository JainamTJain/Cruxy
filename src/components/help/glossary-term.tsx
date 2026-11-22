"use client";

import { useId, useState } from "react";
import { findGlossaryTerm } from "@/lib/help/glossary";
import { cn } from "@/lib/utils";

type Props = {
  term: string;
  children?: React.ReactNode;
  className?: string;
};

/**
 * Tap a marked term for a one-line meaning from the shared glossary.
 */
export function GlossaryTerm({ term, children, className }: Props) {
  const entry = findGlossaryTerm(term);
  const [open, setOpen] = useState(false);
  const tipId = useId();

  if (!entry) {
    return <span className={className}>{children ?? term}</span>;
  }

  return (
    <span className={cn("relative inline", className)}>
      <button
        type="button"
        className="border-b border-dotted border-ink/40 font-medium text-ink"
        aria-describedby={open ? tipId : undefined}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
      >
        {children ?? entry.term}
      </button>
      {open ? (
        <span
          id={tipId}
          role="tooltip"
          className="absolute left-0 top-full z-30 mt-1 w-64 rounded-xl border border-ink/10 bg-white p-3 text-left text-xs leading-snug text-ink shadow-[0_8px_24px_rgba(17,19,24,0.12)]"
        >
          <strong className="block font-display text-sm">{entry.term}</strong>
          <span className="mt-1 block text-muted">{entry.meaning}</span>
        </span>
      ) : null}
    </span>
  );
}
