"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

  async function load() {
    const res = await fetch("/api/checklist");
    if (!res.ok) return;
    const data = (await res.json()) as {
      items: Item[];
      complete: boolean;
    };
    setItems(data.items);
    setComplete(data.complete);
    const ch = await fetch("/api/auth/champion");
    if (ch.ok) {
      const c = (await ch.json()) as { championId?: string | null };
      setChampionId(c.championId ?? null);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function toggle(key: string, done: boolean) {
    setBusy(key);
    try {
      await fetch("/api/checklist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, done: !done }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function becomeChampion() {
    await fetch("/api/auth/champion", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "set" }),
    });
    await load();
  }

  const done = items.filter((i) => i.done).length;

  return (
    <main className="animate-fade-up space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">First-run checklist</h1>
        <p className="mt-1 text-sm text-muted">
          About 10 minutes. {done} of {items.length || 5} done
          {complete ? ", complete" : ""}
        </p>
      </div>
      <ul className="space-y-3">
        {items.map((item) => (
          <li
            key={item.key}
            className="flex flex-col gap-2 rounded-2xl border border-ink/10 bg-white/60 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-medium">{item.label}</p>
              <Link href={item.href} className="text-xs text-cardinal underline">
                Open
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
          One person per team gets nudges when teammates have not finished this
          checklist.
        </p>
        <Button className="mt-3" variant="outline" onClick={() => void becomeChampion()}>
          {championId ? "I am the champion" : "Choose me as champion"}
        </Button>
      </div>
      <Link
        href="/home"
        className="inline-flex h-10 items-center justify-center rounded-xl bg-cardinal px-4 text-sm font-semibold text-white"
      >
        Go to home
      </Link>
    </main>
  );
}
