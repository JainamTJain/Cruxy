"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type Signal = "shorter" | "example" | "more_detail";

const CHIPS: { signal: Signal; label: string }[] = [
  { signal: "shorter", label: "Shorter" },
  { signal: "example", label: "Example" },
  { signal: "more_detail", label: "More detail" },
];

/**
 * Small chips under Cruxy replies. Updates learning prefs quietly.
 */
export function PreferenceChips({ className }: { className?: string }) {
  const [sent, setSent] = useState<Signal | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(signal: Signal) {
    if (busy) return;
    setBusy(true);
    await fetch("/api/learning-profile/signal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signal }),
    }).catch(() => undefined);
    setBusy(false);
    setSent(signal);
  }

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {CHIPS.map((c) => (
        <button
          key={c.signal}
          type="button"
          disabled={busy}
          onClick={() => void send(c.signal)}
          className={cn(
            "rounded-lg border px-2 py-1 text-[11px] font-medium",
            sent === c.signal
              ? "border-cardinal bg-cardinal/10 text-cardinal"
              : "border-ink/15 bg-white text-muted hover:border-ink/30",
          )}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
