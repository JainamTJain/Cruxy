"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CASE_TITLES } from "@/lib/constants";
import { pageFromAnchor } from "@/lib/library/search-display";

type Hit = {
  kind: string;
  id: string;
  file_id: string | null;
  drive_id: string | null;
  anchor: string | null;
  title: string;
  snippet: string;
  score: number;
  case_numbers: number[];
  type: string | null;
  team_id?: string | null;
};

type Team = { id: string; name: string };

export default function LibrarySearchPage() {
  const [q, setQ] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [type, setType] = useState("");
  const [teamId, setTeamId] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [hits, setHits] = useState<Hit[]>([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/revision/one-pagers")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { teams?: Team[] } | null) => {
        if (d?.teams) setTeams(d.teams);
      })
      .catch(() => null);
  }, []);

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (caseNumber) params.set("case", caseNumber);
      if (type) params.set("type", type);
      if (teamId) params.set("team", teamId);
      const res = await fetch(`/api/library/search?${params}`);
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(j?.error ?? "Search failed. Try again.");
        setHits([]);
        setSearched(true);
        return;
      }
      const data = (await res.json()) as { hits: Hit[] };
      setHits(data.hits);
      setSearched(true);
    } catch {
      setError("Search failed. Check your connection and try again.");
      setHits([]);
      setSearched(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl animate-fade-up space-y-6 px-4 py-6 sm:px-0">
      <div>
        <Link href="/library" className="text-xs text-muted underline">
          Library
        </Link>
        <h1 className="font-display text-3xl font-semibold">Search</h1>
        <p className="mt-1 text-sm text-muted">
          Ranks by meaning and keywords. Each hit shows the passage, its file,
          and page.
        </p>
      </div>

      <form
        onSubmit={(e) => void runSearch(e)}
        className="flex flex-wrap gap-2"
        aria-label="Library search"
      >
        <label className="sr-only" htmlFor="library-search-q">
          Search query
        </label>
        <input
          id="library-search-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search library…"
          className="min-h-11 min-w-[12rem] flex-1 rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
        />
        <label className="sr-only" htmlFor="library-search-case">
          Case filter
        </label>
        <select
          id="library-search-case"
          value={caseNumber}
          onChange={(e) => setCaseNumber(e.target.value)}
          className="min-h-11 rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
        >
          <option value="">All cases</option>
          {CASE_TITLES.filter((c) => c.active).map((c) => (
            <option key={c.number} value={String(c.number)}>
              Case {c.number}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="library-search-team">
          Team filter
        </label>
        <select
          id="library-search-team"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          className="min-h-11 rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
        >
          <option value="">All teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="library-search-type">
          Type filter
        </label>
        <select
          id="library-search-type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="min-h-11 rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
        >
          <option value="">All types</option>
          <option value="case_set">Case set</option>
          <option value="practice_transcript">Transcript</option>
          <option value="team_notes">Team notes</option>
          <option value="rules">Rules</option>
          <option value="research">Research</option>
          <option value="coach_guidance">Coach guidance</option>
          <option value="truth">Evidence Library</option>
        </select>
        <Button type="submit" disabled={busy} className="min-h-11">
          {busy ? "Searching…" : "Search"}
        </Button>
      </form>

      {error ? (
        <p className="rounded-2xl border border-cardinal/30 bg-cardinal/10 px-4 py-3 text-sm text-cardinal">
          {error}
        </p>
      ) : null}

      <ul className="space-y-3">
        {!searched ? (
          <li className="text-sm text-muted">Enter a query to search.</li>
        ) : hits.length === 0 ? (
          <li className="text-sm text-muted">No hits.</li>
        ) : (
          hits.map((h) => {
            const page = pageFromAnchor(h.anchor);
            const href = h.file_id
              ? `/library/${h.file_id}${h.anchor ? `#${encodeURIComponent(h.anchor)}` : ""}`
              : h.kind === "truth"
                ? "/case-brain"
                : null;
            return (
              <li
                key={`${h.kind}-${h.id}`}
                className="rounded-2xl border border-ink/10 bg-white px-4 py-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  {href ? (
                    <Link
                      href={href}
                      className="font-display text-lg font-semibold hover:text-cardinal"
                    >
                      {h.title}
                    </Link>
                  ) : (
                    <span className="font-display text-lg font-semibold">
                      {h.title}
                    </span>
                  )}
                  <span className="text-[11px] font-semibold text-muted">
                    {h.kind === "truth"
                      ? "Evidence Library"
                      : h.kind === "comment"
                        ? "Comment"
                        : "Passage"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {h.title}
                  {page.label ? `, ${page.label}` : h.anchor ? `, ${h.anchor}` : ""}
                  {h.case_numbers.length
                    ? `, cases ${h.case_numbers.join(", ")}`
                    : ""}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-ink/90">
                  {h.snippet}
                </p>
              </li>
            );
          })
        )}
      </ul>
    </main>
  );
}
