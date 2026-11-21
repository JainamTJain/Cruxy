"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ClaimRow } from "@/lib/revision/types";
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
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [claimId, setClaimId] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [entries, setEntries] = useState<PhrasebookEntry[]>([]);

  const loadPhrases = useCallback(async () => {
    const qs = teamId && caseId ? `?teamId=${teamId}&caseId=${caseId}` : "";
    const res = await fetch(`/api/revision/language${qs}`);
    const data = (await res.json()) as {
      entries: PhrasebookEntry[];
      claims?: ClaimRow[];
    };
    setEntries(data.entries ?? []);
    if (data.claims) {
      setClaims(data.claims);
      if (!claimId && data.claims[0]) setClaimId(data.claims[0].id);
    }
  }, [teamId, caseId]);

  useEffect(() => {
    void (async () => {
      const meta = await fetch("/api/revision/one-pagers").then((r) => r.json());
      setTeams(meta.teams ?? []);
      setCases(meta.cases ?? []);
      if (meta.teams?.[0]) setTeamId(meta.teams[0].id);
      if (meta.cases?.[0]) setCaseId(meta.cases[0].id);
    })();
  }, []);

  useEffect(() => {
    void loadPhrases();
  }, [loadPhrases]);

  async function suggest() {
    const res = await fetch("/api/revision/language", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "suggest",
        teamId,
        caseId,
        claimId: claimId || undefined,
      }),
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
        claimId: claimId || undefined,
      }),
    });
    await loadPhrases();
  }

  async function remove(entryId: string) {
    await fetch("/api/revision/language", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "delete", entryId }),
    });
    await loadPhrases();
  }

  return (
    <main className="animate-fade-up space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">
          Language and analogies
        </h1>
        <p className="mt-1 text-sm text-muted">
          Plain sentence under 25 words, two everyday analogies, vivid Truth Source
          example, phrases to avoid.
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
        {claims.length ? (
          <select
            className="rounded-xl border border-ink/15 bg-white/80 px-3 py-2 text-sm"
            value={claimId}
            onChange={(e) => setClaimId(e.target.value)}
          >
            {claims.map((c, i) => (
              <option key={c.id} value={c.id}>
                Claim {i + 1}: {c.text.slice(0, 48)}
                {c.text.length > 48 ? "…" : ""}
              </option>
            ))}
          </select>
        ) : (
          <span className="self-center text-xs text-muted">No claims yet</span>
        )}
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
            <ul className="space-y-2 text-sm">
              {suggestions.analogies.map((a) => (
                <li key={a} className="flex flex-wrap items-baseline gap-2">
                  <span>{a}</span>
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
            <p className="text-sm">{suggestions.vivid || "Not set"}</p>
            {suggestions.vivid ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="mt-1"
                onClick={() => void save(suggestions.vivid, "vivid")}
              >
                Save to phrasebook
              </Button>
            ) : null}
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
              className="flex items-start justify-between gap-2 rounded-xl border border-ink/10 bg-white/60 px-3 py-2 text-sm"
            >
              <div>
                <span className="text-xs text-muted">{e.kind}</span>
                <p>{e.text}</p>
              </div>
              <button
                type="button"
                className="shrink-0 text-xs text-muted underline"
                onClick={() => void remove(e.id)}
              >
                Remove
              </button>
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