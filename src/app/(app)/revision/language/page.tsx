"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { PhrasebookEntry } from "@/lib/revision/types";
import type { CaseRow, Team } from "@/lib/types";

type Suggestions = {
  plain: string;
  analogies: string[];
  vivid: string;
  avoid: string[];
};

export default function LanguagePage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [teamId, setTeamId] = useState("");
  const [caseId, setCaseId] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [entries, setEntries] = useState<PhrasebookEntry[]>([]);

  async function loadPhrases() {
    const res = await fetch("/api/revision/language");
    const data = (await res.json()) as { entries: PhrasebookEntry[] };
    setEntries(data.entries);
  }

  useEffect(() => {
    void (async () => {
      const meta = await fetch("/api/revision/one-pagers").then((r) => r.json());
      setTeams(meta.teams ?? []);
      setCases(meta.cases ?? []);
      if (meta.teams?.[0]) setTeamId(meta.teams[0].id);
      if (meta.cases?.[0]) setCaseId(meta.cases[0].id);
      await loadPhrases();
    })();
  }, []);

  async function suggest() {
    const res = await fetch("/api/revision/language", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "suggest", teamId, caseId }),
    });
    const data = (await res.json()) as { suggestions: Suggestions };
    setSuggestions(data.suggestions);
  }

  async function save(text: string, kind: PhrasebookEntry["kind"]) {
    await fetch("/api/revision/language", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "save",
        text,
        kind,
        caseId,
      }),
    });
    await loadPhrases();
  }

  return (
    <main className="animate-fade-up space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">
          Language & analogies
        </h1>
        <p className="mt-1 text-sm text-muted">
          Plain sentence under 25 words, everyday analogies, vivid Truth Source example,
          phrases to avoid.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          className="rounded-xl border border-ink/15 bg-white/80 px-3 py-2 text-sm"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          className="rounded-xl border border-ink/15 bg-white/80 px-3 py-2 text-sm"
          value={caseId}
          onChange={(e) => setCaseId(e.target.value)}
        >
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {String(c.number).padStart(2, "0")} {c.title}
            </option>
          ))}
        </select>
        <Button type="button" onClick={() => void suggest()}>
          Suggest
        </Button>
      </div>

      {suggestions ? (
        <div className="space-y-3 rounded-2xl border border-ink/10 bg-white/70 p-4">
          <div>
            <p className="text-xs uppercase text-muted">Plain</p>
            <p className="text-sm">{suggestions.plain}</p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mt-1"
              onClick={() => void save(suggestions.plain, "plain")}
            >
              Save to phrasebook
            </Button>
          </div>
          <div>
            <p className="text-xs uppercase text-muted">Analogies</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {suggestions.analogies.map((a) => (
                <li key={a}>
                  {a}{" "}
                  <button
                    type="button"
                    className="text-xs text-cardinal underline"
                    onClick={() => void save(a, "analogy")}
                  >
                    save
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs uppercase text-muted">Vivid example</p>
            <p className="text-sm">{suggestions.vivid || "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted">Avoid</p>
            <p className="text-sm">{suggestions.avoid.join(", ")}</p>
          </div>
        </div>
      ) : null}

      <section>
        <h2 className="font-display text-lg font-semibold">Your phrasebook</h2>
        <ul className="mt-2 space-y-2">
          {entries.map((e) => (
            <li
              key={e.id}
              className="rounded-xl border border-ink/10 bg-white/60 px-3 py-2 text-sm"
            >
              <span className="text-xs text-muted">{e.kind}</span>
              <p>{e.text}</p>
            </li>
          ))}
          {!entries.length ? (
            <li className="text-sm text-muted">No saved phrases yet.</li>
          ) : null}
        </ul>
      </section>
    </main>
  );
}
