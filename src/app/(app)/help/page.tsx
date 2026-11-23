"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PageIntro } from "@/components/page-intro";
import { GlossaryTerm } from "@/components/help/glossary-term";
import { HELP_FAQS, searchFaqs } from "@/lib/help/faq";
import { startGuidedTour } from "@/components/product/guided-tour";

export default function HelpPage() {
  const [q, setQ] = useState("");
  const faqs = useMemo(() => searchFaqs(q), [q]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 animate-fade-up pb-10">
      <PageIntro title="Help">
        Short answers for a first week on Crux. Search, or tap a question.
      </PageIntro>

      <div className="flex flex-wrap gap-3 text-sm">
        <button
          type="button"
          onClick={() => startGuidedTour()}
          className="font-semibold text-cardinal underline"
        >
          Take the tour
        </button>
        <Link href="/help/ethics-bowl" className="underline text-muted">
          Ethics Bowl in 90 seconds
        </Link>
        <Link href="/help/glossary" className="underline text-muted">
          Glossary
        </Link>
        <Link href="/help/whats-new" className="underline text-muted">
          What&apos;s new
        </Link>
      </div>

      <label className="block">
        <span className="sr-only">Search help</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search help…"
          className="h-11 w-full rounded-xl border border-ink/15 bg-white px-3 text-sm"
        />
      </label>

      <p className="m-0 text-xs text-muted">
        Tip: tap{" "}
        <GlossaryTerm term="APPE" />
        {", "}
        <GlossaryTerm term="commentary" />
        {", or "}
        <GlossaryTerm term="Evidence Library" /> for a one-line meaning.
      </p>

      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {faqs.length === 0 ? (
          <li className="rounded-[20px] bg-white p-5 text-sm text-muted">
            Nothing matched. Try another word, or use Report on this page.
          </li>
        ) : (
          faqs.map((f) => (
            <li
              key={f.id}
              className="rounded-[20px] bg-white p-5"
            >
              <h2 className="font-display m-0 text-lg font-extrabold">
                {f.question}
              </h2>
              <p className="mt-2 text-sm leading-snug text-ink">{f.answer}</p>
              {f.href ? (
                <Link
                  href={f.href}
                  className="mt-3 inline-block text-sm font-semibold text-cardinal underline"
                >
                  Open
                </Link>
              ) : null}
            </li>
          ))
        )}
      </ul>

      <p className="text-xs text-muted">
        {HELP_FAQS.length} questions. Still stuck? Tap Report.
      </p>
    </main>
  );
}
