"use client";

import { useCallback, useEffect, useState } from "react";

type GraphSpineStats = {
  ready: boolean;
  edge_count: number;
  by_type: Record<string, number>;
  claims_missing_embedding: number;
  supports_missing_embedding: number;
  counterclaims_missing_embedding: number;
  passages_stub_embedding: number;
  passages_total: number;
  claims_total: number;
  supports_total: number;
  counterclaims_total: number;
  readers: {
    robustness: string;
    mastery: string;
    calibration: string;
  };
};

type BackfillCounts = Record<string, number>;

type Payload = {
  ready: boolean;
  stats: GraphSpineStats;
  counts?: BackfillCounts;
};

function StatLine({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-mono font-semibold">{value}</span>
    </div>
  );
}

/** Tech admin: run graph backfill and show real edge / embed counts. */
export function GraphSpinePanel() {
  const [stats, setStats] = useState<GraphSpineStats | null>(null);
  const [counts, setCounts] = useState<BackfillCounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [canRun, setCanRun] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/graph-spine");
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      throw new Error(j.error ?? "Could not load graph spine");
    }
    return r.json() as Promise<Payload>;
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const me = await fetch("/api/auth/me");
        if (me.ok) {
          const j = (await me.json()) as {
            session?: { role?: string; adminView?: boolean };
            person?: { role?: string };
          };
          setCanRun(
            j.person?.role === "tech_admin" && Boolean(j.session?.adminView),
          );
        }
      } catch {
        setCanRun(false);
      }
      try {
        const d = await load();
        setStats(d.stats);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
  }, [load]);

  async function runBackfill() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/graph-spine", { method: "POST" });
      const j = (await r.json()) as Payload & { error?: string };
      if (!r.ok) throw new Error(j.error ?? "Backfill failed");
      setStats(j.stats);
      setCounts(j.counts ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backfill failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-[20px] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <strong className="font-display text-lg">Graph spine</strong>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Backfill edges from claim maps, Truth Sources, proposals, and
            practice. Re-embed stub passages and claim nodes. One summary row
            in the activity log; edges themselves stay quiet.
          </p>
        </div>
        {canRun ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void runBackfill()}
            className="inline-flex h-[38px] shrink-0 items-center rounded-[10px] bg-ink px-4 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Running..." : "Run graph backfill"}
          </button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-cardinal">{error}</p> : null}

      {!stats ? (
        <p className="text-sm text-muted">Loading counts...</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 rounded-[12px] bg-[#F7F8FA] p-4">
            <StatLine label="Edges" value={stats.edge_count} />
            <StatLine label="Claims" value={stats.claims_total} />
            <StatLine label="Supports" value={stats.supports_total} />
            <StatLine label="Counterclaims" value={stats.counterclaims_total} />
            <StatLine label="Passages" value={stats.passages_total} />
          </div>
          <div className="flex flex-col gap-1.5 rounded-[12px] bg-[#F7F8FA] p-4">
            <StatLine
              label="Claims needing embed"
              value={stats.claims_missing_embedding}
            />
            <StatLine
              label="Supports needing embed"
              value={stats.supports_missing_embedding}
            />
            <StatLine
              label="Counterclaims needing embed"
              value={stats.counterclaims_missing_embedding}
            />
            <StatLine
              label="Passage stubs"
              value={stats.passages_stub_embedding}
            />
          </div>
        </div>
      )}

      {stats && Object.keys(stats.by_type).length > 0 ? (
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(stats.by_type)
            .sort((a, b) => b[1] - a[1])
            .map(([t, n]) => (
              <span
                key={t}
                className="rounded-md bg-[#ECEEF1] px-2 py-1 font-mono"
              >
                {t}: {n}
              </span>
            ))}
        </div>
      ) : null}

      {stats ? (
        <p className="text-xs text-muted">
          Readers: robustness uses {stats.readers.robustness}; mastery uses{" "}
          {stats.readers.mastery}; calibration uses {stats.readers.calibration}.
        </p>
      ) : null}

      {counts ? (
        <div className="rounded-[12px] border border-line p-3 text-sm">
          <p className="mb-2 font-semibold">Last backfill</p>
          <div className="grid gap-1 sm:grid-cols-2">
            {Object.entries(counts).map(([k, v]) => (
              <StatLine key={k} label={k.replaceAll("_", " ")} value={v} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
