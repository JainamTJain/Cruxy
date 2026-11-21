"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const ITEMS: { key: string; label: string; hint: string }[] = [
  {
    key: "confirm_cases",
    label: "Confirm your cases and roles",
    hint: "Team board lands in Track 4 — mark done once you know your leads.",
  },
  {
    key: "open_reading",
    label: "Open one reading",
    hint: "Reading room is Track 1.",
  },
  {
    key: "review_flashcards",
    label: "Review 5 flashcards",
    hint: "Flashcards are Track 3.",
  },
  {
    key: "answer_aloud",
    label: "Answer one question out loud",
    hint: "Practice modes are Track 5.",
  },
  {
    key: "see_roadmap",
    label: "See your roadmap",
    hint: "Roadmaps are Track 3.",
  },
];

export default function ChecklistPage() {
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { person?: { first_run_checklist?: Record<string, boolean> } }) => {
        setChecklist(d.person?.first_run_checklist ?? {});
      });
  }, []);

  async function toggle(key: string) {
    setBusy(key);
    try {
      const res = await fetch("/api/checklist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, done: !checklist[key] }),
      });
      const data = (await res.json()) as {
        checklist?: Record<string, boolean>;
      };
      if (data.checklist) setChecklist(data.checklist);
    } finally {
      setBusy(null);
    }
  }

  const done = ITEMS.filter((i) => checklist[i.key]).length;

  return (
    <main className="animate-fade-up space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">First-run checklist</h1>
        <p className="mt-1 text-sm text-muted">
          About 10 minutes · {done} of {ITEMS.length} done
        </p>
      </div>
      <ul className="space-y-3">
        {ITEMS.map((item) => (
          <li
            key={item.key}
            className="flex flex-col gap-2 rounded-2xl border border-ink/10 bg-white/60 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-medium">{item.label}</p>
              <p className="text-xs text-muted">{item.hint}</p>
            </div>
            <Button
              size="sm"
              variant={checklist[item.key] ? "gold" : "outline"}
              disabled={busy === item.key}
              onClick={() => void toggle(item.key)}
            >
              {checklist[item.key] ? "Done" : "Mark done"}
            </Button>
          </li>
        ))}
      </ul>
    </main>
  );
}
