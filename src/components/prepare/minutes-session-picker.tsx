"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { FocusBlock, MinutesBudget, SoloPartRow } from "@/lib/team/solo-prep";

type Props = {
  /** When set, prefetch a session for this budget on mount. */
  defaultBudget?: MinutesBudget;
  /** Compact strip for embedding on Today (G). */
  compact?: boolean;
  className?: string;
};

/**
 * "I have 10 / 20 / 45 minutes" picker that builds a focused session from My part.
 * Owned by workstream E; offered to G for Today. New file so Today stays G's page.
 */
export function MinutesSessionPicker({
  defaultBudget,
  compact,
  className,
}: Props) {
  const [budget, setBudget] = useState<MinutesBudget | null>(
    defaultBudget ?? null,
  );
  const [blocks, setBlocks] = useState<FocusBlock[]>([]);
  const [partsLeft, setPartsLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (b: MinutesBudget) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/prepare/parts?budget=${b}`);
      if (!res.ok) {
        setError("Could not build a session.");
        setBlocks([]);
        return;
      }
      const data = (await res.json()) as {
        session?: FocusBlock[] | null;
        parts?: SoloPartRow[];
      };
      setBlocks(data.session ?? []);
      setPartsLeft((data.parts ?? []).filter((p) => !p.done).length);
    } catch {
      setError("Could not build a session.");
      setBlocks([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (defaultBudget) void load(defaultBudget);
  }, [defaultBudget, load]);

  function pick(b: MinutesBudget) {
    setBudget(b);
    void load(b);
  }

  return (
    <section
      className={
        className ??
        (compact
          ? "flex flex-col gap-3"
          : "flex flex-col gap-3 rounded-[20px] bg-white p-5")
      }
    >
      <div>
        <h2 className="font-display m-0 text-lg font-extrabold">
          I have a few minutes
        </h2>
        <p className="m-0 mt-1 text-sm text-muted">
          Pick a budget. Crux builds a focused session from your open parts.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {([10, 20, 45] as MinutesBudget[]).map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => pick(b)}
            className={`h-10 rounded-xl px-4 text-sm font-semibold ${
              budget === b
                ? "bg-ink text-white"
                : "border border-mist bg-white text-ink"
            }`}
            aria-pressed={budget === b}
          >
            {b} min
          </button>
        ))}
      </div>
      {busy ? (
        <p className="m-0 text-sm text-muted">Building your session…</p>
      ) : null}
      {error ? <p className="m-0 text-sm text-cardinal">{error}</p> : null}
      {!busy && budget && !blocks.length ? (
        <p className="m-0 text-sm text-muted">
          {partsLeft === 0
            ? "Nothing left on your part list. Open Prepare to mark new work or run a mock."
            : "No blocks fit that budget. Try 20 or 45 minutes."}
        </p>
      ) : null}
      {blocks.length > 0 ? (
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {blocks.map((block, i) => (
            <li
              key={`${block.caseId}-${block.part}-${i}`}
              className="flex flex-col gap-1 rounded-2xl border border-mist px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="m-0 text-sm font-semibold text-ink">
                  {block.minutes} min: {block.label}
                </p>
                <p className="m-0 text-xs text-muted">{block.why}</p>
              </div>
              <Link
                href={block.href}
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl bg-ink px-3 text-sm font-semibold text-white"
              >
                Start
              </Link>
            </li>
          ))}
        </ol>
      ) : null}
      <Link
        href="/prepare"
        className="text-sm font-semibold text-cardinal underline-offset-2 hover:underline"
      >
        Open my part list
      </Link>
    </section>
  );
}
