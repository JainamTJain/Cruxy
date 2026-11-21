"use client";

import { useState } from "react";
import type { RecordingLayout } from "@/lib/practice/types";

const OPTIONS: { id: RecordingLayout; label: string; blurb: string }[] = [
  {
    id: "room",
    label: "One device in the room",
    blurb: "One microphone. Labels from voices and roles; admin confirms after.",
  },
  {
    id: "own_device",
    label: "Everyone on their own device",
    blurb: "Each phone records its owner. Best for online sessions.",
  },
  {
    id: "mixed",
    label: "Mixed",
    blurb: "Room mic plus phones. Crux lines them up by time.",
  },
];

type Props = {
  roundId: string;
  value?: RecordingLayout;
  onChange?: (layout: RecordingLayout) => void;
};

/** F-218 / F-219 / F-220 */
export function RecordingLayoutPicker({ roundId, value = "room", onChange }: Props) {
  const [layout, setLayout] = useState<RecordingLayout>(value);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function choose(next: RecordingLayout) {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/practice/rounds/${roundId}/layout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ layout: next }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json();
      setMsg(d.error ?? "Could not save");
      return;
    }
    setLayout(next);
    onChange?.(next);
    setMsg("Recording layout saved.");
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#8C929D]">
        How we record
      </span>
      <div className="flex flex-col gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            disabled={busy}
            onClick={() => void choose(o.id)}
            className={
              layout === o.id
                ? "rounded-2xl border-2 border-[#E8C36A] bg-[#1E2129] p-3 text-left text-[#F2F3F5]"
                : "rounded-2xl border border-[#3B404A] bg-[#16181F] p-3 text-left text-[#C9CCD3]"
            }
          >
            <div className="text-sm font-bold">{o.label}</div>
            <div className="mt-0.5 text-xs text-[#8C929D]">{o.blurb}</div>
          </button>
        ))}
      </div>
      {msg ? <p className="text-xs text-[#8C929D]">{msg}</p> : null}
    </div>
  );
}
