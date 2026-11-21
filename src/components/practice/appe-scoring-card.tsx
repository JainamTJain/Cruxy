"use client";

import { useMemo, useState } from "react";
import { APPE_SCORE_ITEMS, type AppeItemKey } from "@/lib/practice/types";
import { applicableItems, presentationTotal, teamTotal } from "@/lib/practice/appe-card";
import { Button } from "@/components/ui/button";

type TeamCol = { id: string; name: string };

type Props = {
  teams: TeamCol[];
  hasCommentingTeam: boolean;
  hasJudgesQa: boolean;
  onSubmit: (payload: {
    teamId: string;
    scores: {
      item: AppeItemKey;
      score: number;
      comment?: string;
    }[];
    spirit?: number;
    overallComment?: string;
    predictions?: Record<string, number>;
  }) => Promise<void>;
  predictFirst?: boolean;
};

export function AppeScoringCard({
  teams,
  hasCommentingTeam,
  hasJudgesQa,
  onSubmit,
  predictFirst,
}: Props) {
  const { scored, notScored } = useMemo(
    () => applicableItems({ hasCommentingTeam, hasJudgesQa }),
    [hasCommentingTeam, hasJudgesQa],
  );

  const [values, setValues] = useState<
    Record<string, Partial<Record<AppeItemKey, number>>>
  >(() => Object.fromEntries(teams.map((t) => [t.id, {}])));
  const [predictions, setPredictions] = useState<
    Partial<Record<AppeItemKey, number>>
  >({});
  const [predicted, setPredicted] = useState(!predictFirst);
  const [spirit, setSpirit] = useState(4);
  const [overall, setOverall] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function setScore(teamId: string, item: AppeItemKey, score: number) {
    setValues((v) => ({
      ...v,
      [teamId]: { ...v[teamId], [item]: score },
    }));
  }

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      for (const team of teams) {
        const scores = scored
          .filter((item) => values[team.id]?.[item] != null)
          .map((item) => ({
            item,
            score: values[team.id]![item]!,
          }));
        if (scores.length === 0) continue;
        await onSubmit({
          teamId: team.id,
          scores,
          spirit,
          overallComment: overall || undefined,
          predictions: predictFirst ? (predictions as Record<string, number>) : undefined,
        });
      }
      setMsg("Card submitted.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  if (predictFirst && !predicted) {
    return (
      <div className="space-y-4 rounded-2xl border border-ink/10 bg-white/70 p-4">
        <h2 className="font-display text-xl font-semibold">Predict your score</h2>
        <p className="text-sm text-muted">
          Guess each item before you open the report. The gap is tracked as a skill.
        </p>
        <div className="space-y-3">
          {scored.map((key) => {
            const meta = APPE_SCORE_ITEMS.find((i) => i.key === key)!;
            return (
              <label key={key} className="block text-sm">
                <span className="font-medium">{meta.label}</span>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={predictions[key] ?? 5}
                  onChange={(e) =>
                    setPredictions((p) => ({
                      ...p,
                      [key]: Number(e.target.value),
                    }))
                  }
                  className="mt-1 w-full"
                />
                <span className="font-mono text-xs">{predictions[key] ?? 5}</span>
              </label>
            );
          })}
        </div>
        <Button type="button" onClick={() => setPredicted(true)}>
          Lock predictions
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 overflow-x-auto rounded-2xl border border-ink/10 bg-white/70 p-4">
      <div>
        <h2 className="font-display text-xl font-semibold">APPE scoring card</h2>
        <p className="text-xs text-muted">
          From the Fillable Scoring Sheet, 1 to 10 per item
        </p>
      </div>
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-ink/10 text-xs uppercase text-muted">
            <th className="py-2 pr-2">Item</th>
            {teams.map((t) => (
              <th key={t.id} className="py-2 pr-2">
                {t.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {APPE_SCORE_ITEMS.map((item) => {
            const ns = notScored.includes(item.key);
            return (
              <tr key={item.key} className="border-b border-ink/5 align-top">
                <td className="py-3 pr-2">
                  <p className="font-medium">{item.label}</p>
                  <p className="text-xs text-muted">{item.question}</p>
                </td>
                {teams.map((t) => (
                  <td key={t.id} className="py-3 pr-2">
                    {ns ? (
                      <span className="text-xs text-muted">not scored</span>
                    ) : (
                      <input
                        type="number"
                        min={1}
                        max={10}
                        className="w-16 rounded-lg border border-ink/15 bg-white px-2 py-1 font-mono"
                        value={values[t.id]?.[item.key] ?? ""}
                        onChange={(e) =>
                          setScore(t.id, item.key, Number(e.target.value))
                        }
                      />
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
          <tr className="font-medium">
            <td className="py-3">Presentation total (A+B+C)</td>
            {teams.map((t) => (
              <td key={t.id} className="py-3 font-mono">
                {presentationTotal(values[t.id] ?? {})}
              </td>
            ))}
          </tr>
          <tr className="font-medium">
            <td className="py-3">Team total</td>
            {teams.map((t) => (
              <td key={t.id} className="py-3 font-mono">
                {teamTotal(values[t.id] ?? {}, scored)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      <label className="block text-sm">
        Spirit (1–5)
        <input
          type="number"
          min={1}
          max={5}
          className="ml-2 w-16 rounded-lg border border-ink/15 px-2 py-1"
          value={spirit}
          onChange={(e) => setSpirit(Number(e.target.value))}
        />
      </label>
      <label className="block text-sm">
        Overall comment
        <textarea
          className="mt-1 w-full rounded-xl border border-ink/15 bg-white p-3"
          rows={3}
          value={overall}
          onChange={(e) => setOverall(e.target.value)}
        />
      </label>
      {msg ? <p className="text-sm">{msg}</p> : null}
      <Button type="button" disabled={busy} onClick={() => void submit()}>
        {busy ? "Submitting…" : "Submit card"}
      </Button>
    </div>
  );
}
