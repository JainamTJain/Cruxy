"use client";

import { useCallback, useEffect, useState } from "react";

type ItemUse = {
  item: string;
  use_decision: "full" | "reduced" | "feedback_only";
  reason: string;
};

type Analysis = {
  id: string;
  card_id: string;
  background_guess: string | null;
  evidence_note: string;
  position_lean_note: string;
  drift_note: string;
  agreement_note: string;
  conflicts_note: string;
  overall_note: string;
  overall_use: string;
  effective_use: string;
  override_use: string | null;
  override_reason: string | null;
};

type Bundle = { analysis: Analysis; itemUses: ItemUse[] };

/** F-265 tech-admin view of card analysis (never shown to members). */
export function JudgeCardAnalysisPanel({
  roundId,
}: {
  roundId: string | null;
}) {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<
    { item: string; delta: number; agreement_count: number }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const q = roundId ? `?roundId=${encodeURIComponent(roundId)}` : "";
    const res = await fetch(`/api/admin/judge-card-analysis${q}`);
    const data = (await res.json()) as {
      analyses?: Bundle[];
      corrections?: { item: string; delta: number; agreement_count: number }[];
      emptyMessage?: string | null;
      error?: string;
    };
    if (!res.ok) throw new Error(data.error ?? "Forbidden");
    setBundles(data.analyses ?? []);
    setCorrections(data.corrections ?? []);
    setEmptyMessage(data.emptyMessage ?? null);
  }, [roundId]);

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message));
  }, [load]);

  async function override(
    cardId: string,
    use: "full" | "reduced" | "feedback_only",
  ) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/judge-card-analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "override",
          cardId,
          use,
          reason: reason[cardId] ?? "",
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Override failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Override failed");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return <p className="text-sm text-cardinal">{error}</p>;
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display m-0 text-2xl font-extrabold">
          Card analysis
        </h2>
        <p className="mt-1 text-sm text-muted">
          Technical admin only. Members see scores and reasons, not this panel.
        </p>
      </div>

      {emptyMessage ? (
        <p className="rounded-[14px] bg-[#F7F8FA] px-4 py-3 text-sm leading-snug">
          {emptyMessage}
        </p>
      ) : null}

      {bundles.map(({ analysis, itemUses }) => (
        <article
          key={analysis.id}
          className="space-y-3 rounded-[20px] bg-white p-5"
        >
          <p className="text-xs font-bold uppercase tracking-wide text-muted">
            Card {analysis.card_id.slice(0, 8)}
            <span className="ml-2 rounded-md bg-ink px-2 py-0.5 font-semibold normal-case tracking-normal text-white">
              {analysis.effective_use}
            </span>
          </p>
          {analysis.background_guess ? (
            <p className="text-sm text-[#3B404A]">{analysis.background_guess}</p>
          ) : null}
          <ul className="space-y-1.5 text-sm leading-snug">
            <li>
              <strong>Evidence.</strong> {analysis.evidence_note}
            </li>
            <li>
              <strong>Position lean.</strong> {analysis.position_lean_note}
            </li>
            <li>
              <strong>Drift.</strong> {analysis.drift_note}
            </li>
            <li>
              <strong>Agreement.</strong> {analysis.agreement_note}
            </li>
            <li>
              <strong>Conflicts.</strong> {analysis.conflicts_note}
            </li>
          </ul>
          <p className="text-sm">{analysis.overall_note}</p>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted">
              What to learn per item
            </p>
            <ul className="mt-2 space-y-1">
              {itemUses.map((u) => (
                <li
                  key={u.item}
                  className="flex flex-wrap items-baseline gap-2 rounded-xl bg-[#F7F8FA] px-3 py-2 text-sm"
                >
                  <span className="font-mono text-xs">{u.item}</span>
                  <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-bold">
                    {u.use_decision}
                  </span>
                  <span className="text-[#3B404A]">{u.reason}</span>
                </li>
              ))}
              {itemUses.length === 0 ? (
                <li className="text-sm text-muted">No item decisions yet.</li>
              ) : null}
            </ul>
          </div>

          <div className="flex flex-col gap-2 border-t border-ink/10 pt-3">
            <label className="text-sm font-semibold" htmlFor={`ovr-${analysis.card_id}`}>
              Override (with reason)
            </label>
            <input
              id={`ovr-${analysis.card_id}`}
              value={reason[analysis.card_id] ?? ""}
              onChange={(e) =>
                setReason((r) => ({ ...r, [analysis.card_id]: e.target.value }))
              }
              placeholder="Why change what Cruxy decided?"
              className="rounded-xl border border-ink/15 px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              {(["full", "reduced", "feedback_only"] as const).map((use) => (
                <button
                  key={use}
                  type="button"
                  disabled={busy}
                  onClick={() => void override(analysis.card_id, use)}
                  className="rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Use {use}
                </button>
              ))}
            </div>
            {analysis.override_reason ? (
              <p className="text-xs text-muted">
                Last override: {analysis.override_reason}
              </p>
            ) : null}
          </div>
        </article>
      ))}

      <section className="rounded-[20px] bg-white p-5">
        <h3 className="font-display m-0 text-lg font-extrabold">
          Slow scoring corrections
        </h3>
        <p className="mt-1 text-sm text-muted">
          Moves only when several analysed cards agree.
        </p>
        {corrections.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            No corrections yet. They appear after enough real cards agree.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {corrections.map((c) => (
              <li
                key={c.item}
                className="flex justify-between rounded-xl bg-[#F7F8FA] px-3 py-2 text-sm"
              >
                <span className="font-mono text-xs">{c.item}</span>
                <span>
                  delta {c.delta > 0 ? "+" : ""}
                  {c.delta}, from {c.agreement_count} cards
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
