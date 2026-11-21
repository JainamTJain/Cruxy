"use client";

import { shortQuoteForDisplay } from "@/lib/cruxy/copyright";
import { countWords } from "@/lib/cruxy/shorten";
import { OriginTag } from "@/components/case-brain/origin-tag";
import { cn } from "@/lib/utils";

type Props = {
  point: string;
  whyItMatters?: string | null;
  quote?: string | null;
  link?: string | null;
  verified?: boolean;
  needsCheck?: boolean;
  className?: string;
};

/**
 * F-102: finding card at most 40 words; full source one tap away.
 */
export function FindingCard({
  point,
  whyItMatters,
  quote,
  link,
  verified,
  needsCheck,
  className,
}: Props) {
  const words = countWords(point);
  const displayQuote = shortQuoteForDisplay(quote ?? "");

  return (
    <article
      className={cn(
        "space-y-2 rounded-2xl border border-[var(--crux-line)] bg-white p-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <OriginTag label="Cruxy research" />
        {verified && !needsCheck ? (
          <span className="text-[11px] font-semibold text-[var(--crux-ink)]">
            Verified
          </span>
        ) : null}
        {needsCheck ? (
          <span className="text-[11px] font-semibold text-cardinal">
            Needs check
          </span>
        ) : null}
      </div>
      <p className="m-0 text-sm leading-snug text-[var(--crux-ink)]">{point}</p>
      {words > 40 ? (
        <p className="m-0 text-[11px] text-cardinal">
          Over 40 words ({words}). Cap in research.
        </p>
      ) : null}
      {whyItMatters ? (
        <p className="m-0 text-xs text-[var(--crux-muted)]">{whyItMatters}</p>
      ) : null}
      {displayQuote ? (
        <blockquote className="m-0 border-l-2 border-[var(--crux-line)] pl-3 text-xs italic text-[var(--crux-ink)]">
          “{displayQuote}”
        </blockquote>
      ) : null}
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--crux-cardinal)] underline"
        >
          Full source
        </a>
      ) : null}
    </article>
  );
}
