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
  citation_ids?: string[];
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPhrases = useCallback(async () => {
    if (!teamId || !caseId) return;
    try {
      const qs = `?teamId=${teamId}&caseId=${caseId}`;
      const res = await fetch(`/api/revision/language${qs}`);
      const data = (await res.json()) as {
        entries?: PhrasebookEntry[];
        claims?: ClaimRow[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not load phrases. Try again.");
        return;
      }
      setEntries(data.entries ?? []);
      const nextClaims = data.claims ?? [];
      setClaims(nextClaims);
      setClaimId((prev) => {
        if (prev && nextClaims.some((c) => c.id === prev)) return prev;
        return nextClaims[0]?.id ?? "";
      });
      setError(null);
    } catch {
      setError("Could not load phrases. Try again.");
    }
  }, [teamId, caseId]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/revision/one-pagers");
        const meta = (await res.json()) as {
          teams?: Team[];
          cases?: CaseRow[];
          error?: string;
        };
        if (!res.ok) {
          setError(meta.error ?? "Could not load cases. Try again.");
          return;
        }
        setTeams(meta.teams ?? []);
        setCases(meta.cases ?? []);
        if (meta.teams?.[0]) setTeamId(meta.teams[0].id);
        if (meta.cases?.[0]) setCaseId(meta.cases[0].id);
      } catch {
        setError("Could not load cases. Try again.");
      }
    })();
  }, []);

  useEffect(() => {
    setSuggestions(null);
    void loadPhrases();
  }, [loadPhrases]);

  async function suggest() {
    if (!teamId || !caseId || busy) return;
    setBusy(true);
    setError(null);
    try {
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
      const data = (await res.json()) as {
        suggestions?: Suggestions;
        error?: string;
      };
      if (!res.ok || !data.suggestions) {
        setError(
          data.error ?? "Cruxy could not suggest language. Try again.",
        );
        return;
      }
      // No citation, no display for Cruxy-written lines.
      if (!(data.suggestions.citation_ids?.length ?? 0)) {
        setSuggestions(null);
        setError(
          "Cruxy could not cite sources for these lines. Try again, or pick another claim.",
        );
        return;
      }
      setSuggestions(data.suggestions);
    } catch {
      setError("Cruxy could not suggest language. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function save(text: string, kind: PhrasebookEntry["kind"]) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/revision/language", {
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
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Could not save. Try again.");
        return;
      }
      await loadPhrases();
    } catch {
      setError("Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(entryId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/revision/language", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete", entryId }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Could not remove. Try again.");
        return;
      }
      await loadPhrases();
    } catch {
      setError("Could not remove. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="animate-fade-up space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">
          Language and analogies
        </h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Turn a claim into a plain sentence, two everyday analogies, and a
          vivid example from the Evidence Library. Save lines you want to reuse
          in your phrasebook.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          Team
          <select
            className="min-h-11 w-full max-w-full rounded-xl border border-ink/15 bg-white/80 px-3 py-2 text-sm text-ink sm:w-auto sm:max-w-md"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            disabled={busy}
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          Case
          <select
            className="min-h-11 w-full max-w-full rounded-xl border border-ink/15 bg-white/80 px-3 py-2 text-sm text-ink sm:w-auto sm:max-w-md"
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            disabled={busy}
          >
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {String(c.number).padStart(2, "0")} {c.title}
              </option>
            ))}
          </select>
        </label>
        {claims.length ? (
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Claim
            <select
              className="min-h-11 w-full max-w-full rounded-xl border border-ink/15 bg-white/80 px-3 py-2 text-sm text-ink sm:w-auto sm:max-w-md"
              value={claimId}
              onChange={(e) => setClaimId(e.target.value)}
              disabled={busy}
            >
              {claims.map((c, i) => (
                <option key={c.id} value={c.id}>
                  Claim {i + 1}: {c.text.slice(0, 48)}
                  {c.text.length > 48 ? "…" : ""}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="self-end text-xs text-muted">No claims yet</span>
        )}
        <Button
          type="button"
          className="self-end"
          disabled={busy || !teamId || !caseId}
          aria-busy={busy}
          onClick={() => void suggest()}
        >
          {busy ? "Working…" : "Suggest"}
        </Button>
      </div>

      {error ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-cardinal" role="alert">
            {error}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void suggest()}
          >
            Try again
          </Button>
        </div>
      ) : null}

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
              disabled={busy}
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
                    className="min-h-11 text-xs font-semibold text-cardinal underline"
                    disabled={busy}
                    onClick={() => void save(a, "analogy")}
                  >
                    Save
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs uppercase text-muted">Vivid example</p>
            <p className="text-sm">{suggestions.vivid || "None yet"}</p>
            {suggestions.vivid ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="mt-1"
                disabled={busy}
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
                className="min-h-11 shrink-0 text-xs font-semibold text-muted underline"
                disabled={busy}
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
