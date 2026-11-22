"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LoadingGenie } from "@/components/cruxy/mood/loading-genie";
import { LiftCard } from "@/components/motion/lift-card";
import { TabFade } from "@/components/motion/tab-fade";
import { GraphSpinePanel } from "@/components/admin/graph-spine-panel";

type Row = {
  id: string;
  label: string;
  href: string;
  meta?: string;
};

type Tile = {
  id: string;
  title: string;
  source: string;
  ready: boolean;
  emptyMessage: string;
  summary: string;
  value: number | null;
  secondary?: string;
  series: { label: string; value: number }[];
  rows: Row[];
};

function FlywheelInner() {
  const search = useSearchParams();
  const focus = search.get("tile");
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(focus);

  useEffect(() => {
    void fetch("/api/admin/flywheel")
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json()) as { error?: string };
          throw new Error(j.error ?? "Forbidden");
        }
        return r.json() as Promise<{
          tiles: Tile[];
          generatedAt: string;
        }>;
      })
      .then((d) => {
        setTiles(d.tiles);
        setGeneratedAt(d.generatedAt);
        if (!active && d.tiles[0]) setActive(focus ?? d.tiles[0].id);
      })
      .catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (focus) setActive(focus);
  }, [focus]);

  const selected = useMemo(
    () => tiles.find((t) => t.id === (active ?? focus)) ?? tiles[0] ?? null,
    [tiles, active, focus],
  );

  if (error) {
    return (
      <main className="animate-fade-up space-y-3">
        <p className="text-sm text-cardinal">{error}</p>
        <Link href="/admin" className="text-sm underline">
          Back to admin
        </Link>
      </main>
    );
  }

  if (!tiles.length) {
    return <LoadingGenie label="Loading flywheel..." />;
  }

  return (
    <main className="animate-fade-up mx-auto flex w-full max-w-5xl flex-col gap-5 px-1 pb-10 sm:px-0">
      <div>
        <p className="text-xs font-bold tracking-[0.1em] text-muted">
          REASONING FLYWHEEL
        </p>
        <h1 className="font-display text-[36px] font-extrabold leading-none tracking-[-0.02em] sm:text-[40px]">
          Flywheel dashboard
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Every use of Crux should make the next one better. Tiles fill as each
          Wave 6 source lands. Numbers link to the rows behind them. Empty
          sources say so honestly.
        </p>
        {generatedAt ? (
          <p className="mt-1 text-xs text-muted">
            Updated {new Date(generatedAt).toLocaleString()}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => {
          const on = selected?.id === t.id;
          return (
            <LiftCard
              key={t.id}
              as="div"
              className={
                on
                  ? "rounded-[20px] border border-ink bg-white"
                  : "rounded-[20px] border border-ink/10 bg-white/70"
              }
            >
            <button
              type="button"
              onClick={() => setActive(t.id)}
              className="flex w-full flex-col gap-2 p-5 text-left"
            >
              <span className="text-[11px] font-bold tracking-[0.08em] text-muted">
                {t.source}
              </span>
              <strong className="font-display text-lg">{t.title}</strong>
              {t.value != null ? (
                <span className="font-mono text-3xl font-semibold">
                  {t.value}
                  {t.secondary ? (
                    <span className="ml-2 text-sm font-normal text-muted">
                      {t.secondary}
                    </span>
                  ) : null}
                </span>
              ) : (
                <span className="text-sm text-muted">Not enough data yet</span>
              )}
              <span className="text-sm text-muted">{t.summary}</span>
              {t.series.length > 0 ? (
                <div className="mt-1 flex h-10 items-end gap-1">
                  {t.series.slice(-14).map((s, i) => {
                    const max = Math.max(
                      1,
                      ...t.series.slice(-14).map((x) => x.value),
                    );
                    const h = Math.max(4, Math.round((s.value / max) * 40));
                    return (
                      <div
                        key={`${s.label}-${i}`}
                        title={`${s.label}: ${s.value}`}
                        className="w-full rounded-t bg-ink/80"
                        style={{ height: `${h}px` }}
                      />
                    );
                  })}
                </div>
              ) : null}
            </button>
            </LiftCard>
          );
        })}
      </div>

      {selected ? (
        <TabFade tabKey={selected.id}>
        <section className="rounded-[20px] bg-white p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-xl font-semibold">
              {selected.title}
            </h2>
            <span className="text-xs text-muted">{selected.source}</span>
          </div>
          {!selected.ready || selected.rows.length === 0 ? (
            <p className="text-sm text-muted">
              {selected.emptyMessage || "Not enough data yet."}
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {selected.rows.map((r) => (
                <li key={r.id}>
                  <Link
                    href={r.href}
                    className="flex flex-wrap items-baseline justify-between gap-2 rounded-[10px] bg-[#F7F8FA] px-3 py-2 hover:bg-[#ECEEF1]"
                  >
                    <span>{r.label}</span>
                    {r.meta ? (
                      <span className="font-mono text-xs text-muted">
                        {r.meta}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        </TabFade>
      ) : null}

      <GraphSpinePanel />

      <Link href="/admin" className="text-sm underline">
        Back to admin
      </Link>
    </main>
  );
}

export default function FlywheelPage() {
  return (
    <Suspense
      fallback={<LoadingGenie label="Loading flywheel..." />}
    >
      <FlywheelInner />
    </Suspense>
  );
}
