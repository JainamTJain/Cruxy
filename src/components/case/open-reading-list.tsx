"use client";

import { useEffect, useState } from "react";

type Item = {
  id: string;
  title: string;
  url: string;
  source_kind: string;
  why: string | null;
  authors: string | null;
  year: number | null;
};

const KIND: Record<string, string> = {
  encyclopedia: "Encyclopedia",
  paper: "Paper",
  report: "Report",
  court: "Court decision",
  news: "Journalism",
  book: "Open book",
  other: "Reading",
};

/** Free material from the web that Cruxy found for a deeper dive on this case. */
export function OpenReadingList({ caseId }: { caseId: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  useEffect(() => {
    let live = true;
    void fetch(`/api/case/open-reading?caseId=${encodeURIComponent(caseId)}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j: { items?: Item[] }) => {
        if (live) setItems(j.items ?? []);
      })
      .catch(() => live && setItems([]));
    return () => {
      live = false;
    };
  }, [caseId]);

  if (!items) return null;
  return (
    <section className="rounded-[20px] bg-white p-4">
      <h3 className="font-display m-0 text-lg font-extrabold">Deeper reading from the web</h3>
      <p className="mt-1 text-[13px] text-muted">
        Free to read. Cruxy found these for a deeper dive: encyclopedia entries,
        papers on both sides, the primary sources behind the case and serious
        reporting.
      </p>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          Cruxy is still gathering these. Check back tomorrow.
        </p>
      ) : (
        <ul className="m-0 mt-3 list-none space-y-2.5 p-0">
          {items.map((it) => (
            <li key={it.id} className="rounded-xl bg-[#F7F8FA] px-3 py-2.5">
              <p className="m-0 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                {KIND[it.source_kind] ?? "Reading"}
                {it.year ? `, ${it.year}` : ""}
              </p>
              <a
                href={it.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-cardinal underline"
              >
                {it.title}
              </a>
              {it.authors ? <span className="text-[13px] text-muted"> by {it.authors}</span> : null}
              {it.why ? <p className="m-0 mt-1 text-[13px] leading-snug text-[#3B404A]">{it.why}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
