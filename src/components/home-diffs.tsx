"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Diff = {
  version_id: string;
  case_id: string;
  version: number;
  change_summary: string;
  old_text: string;
  new_text: string;
  confirmed: boolean;
};

export function HomeDiffs() {
  const [diffs, setDiffs] = useState<Diff[]>([]);

  async function load() {
    const res = await fetch("/api/team/home-diffs");
    if (!res.ok) return;
    const data = await res.json();
    setDiffs(data.diffs ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function confirm(versionId: string) {
    await fetch("/api/team/claim-maps", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "confirm", versionId }),
    });
    await load();
  }

  if (!diffs.length) return null;

  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-semibold">
        Since last visit · map versions
      </h2>
      {diffs.map((d) => (
        <div
          key={d.version_id}
          className="rounded-2xl border border-gold/40 bg-gold/10 px-4 py-4 text-sm"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/70">
            Case changed to v{d.version}
          </p>
          <p className="mt-1 text-muted">{d.change_summary}</p>
          <p className="mt-2">
            <span className="text-muted line-through">{d.old_text}</span>
          </p>
          <p className="font-medium">{d.new_text}</p>
          {!d.confirmed ? (
            <Button
              size="sm"
              className="mt-3"
              variant="gold"
              onClick={() => void confirm(d.version_id)}
            >
              I&apos;ve got v{d.version}
            </Button>
          ) : (
            <p className="mt-2 text-xs text-muted">Confirmed</p>
          )}
        </div>
      ))}
    </section>
  );
}
