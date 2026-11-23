"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { Button } from "@/components/ui/button";

type Item = {
  key: string;
  label: string;
  href: string;
  done: boolean;
};

export default function ChecklistPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [championId, setChampionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/checklist");
      if (!res.ok) {
        setError("Could not load the checklist.");
        return;
      }
      const data = (await res.json()) as {
        items: Item[];
        complete: boolean;
      };
      setItems(data.items);
      setComplete(data.complete);
      setError(null);
      const ch = await fetch("/api/auth/champion");
      if (ch.ok) {
        const c = (await ch.json()) as { championId?: string | null };
        setChampionId(c.championId ?? null);
      }
    } catch {
      setError("Could not reach the checklist. Check signal and try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function toggle(key: string, done: boolean) {
    if (busy) return;
    setBusy(key);
    try {
      const res = await fetch("/api/checklist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, done: !done }),
      });
      if (!res.ok) {
        setError("Could not update that step.");
        return;
      }
      await load();
    } catch {
      setError("Could not update that step.");
    } finally {
      setBusy(null);
    }
  }

  async function becomeChampion() {
    try {
      await fetch("/api/auth/champion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set" }),
      });
      await load();
    } catch {
      setError("Could not set the champion.");
    }
  }

  const done = items.filter((i) => i.done).length;

  return (
    <main className="animate-fade-up space-y-6">
      <PageIntro title="First-run checklist">
        A short tour of Crux so you know where cases, practice and reading live.
        About 10 minutes. {done} of {items.length || 5} done
        {complete ? ", and you are finished" : ""}. Open each item, then mark it
        done.
      </PageIntro>
      {error ? (
        <p className="text-sm text-cardinal">
          {error}{" "}
          <button type="button" className="underline" onClick={() => void load()}>
            Try again
          </button>
        </p>
      ) : null}
      {loading && items.length === 0 ? (
        <p className="text-sm text-muted">Loading checklist…</p>
      ) : null}
      <ul className="space-y-3">
        {items.map((item) => (
          <li
            key={item.key}
            className="flex flex-col gap-2 rounded-2xl border border-ink/10 bg-white/60 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-medium">{item.label}</p>
              <Link href={item.href} className="text-xs text-cardinal underline">
                Open this step
              </Link>
            </div>
            <Button
              variant={item.done ? "secondary" : "outline"}
              disabled={busy === item.key}
              onClick={() => void toggle(item.key, item.done)}
            >
              {item.done ? "Done" : "Mark done"}
            </Button>
          </li>
        ))}
      </ul>
      <div className="rounded-2xl border border-ink/10 bg-white/60 p-4">
        <h2 className="font-display text-lg font-semibold">Team champion</h2>
        <p className="mt-1 text-sm text-muted">
          One person per team gets a gentle nudge when a teammate has not
          finished this checklist. Optional.
        </p>
        <Button className="mt-3" variant="outline" onClick={() => void becomeChampion()}>
          {championId ? "You are the champion" : "Make me the champion"}
        </Button>
      </div>
      <Link
        href="/home"
        className="inline-flex h-10 items-center justify-center rounded-xl bg-cardinal px-4 text-sm font-semibold text-white"
      >
        Go to the program map
      </Link>
    </main>
  );
}
