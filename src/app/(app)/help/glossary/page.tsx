"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PageIntro } from "@/components/page-intro";
import { GlossaryTerm } from "@/components/help/glossary-term";
import { GLOSSARY, searchGlossary } from "@/lib/help/glossary";

export default function GlossaryPage() {
  const [q, setQ] = useState("");
  const terms = useMemo(() => searchGlossary(q), [q]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 animate-fade-up pb-10">
      <PageIntro title="Glossary">
        One-line meanings. Tap a marked term anywhere in Crux for the same list.
      </PageIntro>

      <label className="block">
        <span className="sr-only">Search glossary</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a term…"
          className="h-11 w-full rounded-xl border border-ink/15 bg-white px-3 text-sm"
        />
      </label>

      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {terms.map((t) => (
          <li
            key={t.id}
            className="rounded-[16px] bg-white px-4 py-3"
          >
            <p className="m-0 font-display text-base font-extrabold">
              <GlossaryTerm term={t.term}>{t.term}</GlossaryTerm>
            </p>
            <p className="mt-1 m-0 text-sm text-muted">{t.meaning}</p>
          </li>
        ))}
        {terms.length === 0 ? (
          <li className="text-sm text-muted">No match. Try APPE or Team Brief.</li>
        ) : null}
      </ul>

      <p className="text-xs text-muted">
        {GLOSSARY.length} terms. Same list powers explain-this-term later.
      </p>

      <Link href="/help" className="text-sm underline text-muted">
        All help
      </Link>
    </main>
  );
}
