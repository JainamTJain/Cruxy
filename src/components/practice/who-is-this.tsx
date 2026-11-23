"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Candidate = { person_id: string; name: string; score: number };

type Pending = {
  id: string;
  speaker_label: string;
  clip_url: string | null;
  candidates: Candidate[];
};

type Props = {
  roundId: string;
  people: { id: string; name: string }[];
  isAdmin: boolean;
};

/**
 * Low-confidence speaker match: play a 5s clip and pick who it is.
 * Confirmed clips refine that person's voiceprint.
 */
export function WhoIsThisPanel({ roundId, people, isAdmin }: Props) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/practice/rounds/${roundId}/speakers/pending`);
    if (!res.ok) return;
    const d = (await res.json()) as { pending?: Pending[] };
    setPending(d.pending ?? []);
  }

  useEffect(() => {
    void load();
  }, [roundId]);

  async function confirm(pendingId: string, personId: string) {
    setBusyId(pendingId);
    setMsg(null);
    const res = await fetch(
      `/api/practice/rounds/${roundId}/speakers/pending`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pendingId, personId }),
      },
    );
    const data = (await res.json()) as { error?: string };
    setBusyId(null);
    if (!res.ok) {
      setMsg(data.error ?? "Could not confirm.");
      return;
    }
    setMsg("Saved. Feedback for that voice now goes to the right person.");
    await load();
  }

  if (!pending.length) return null;

  return (
    <section className="rounded-[20px] bg-white p-[22px]">
      <h2 className="font-display m-0 text-[22px] font-extrabold">
        Who is this?
      </h2>
      <p className="mt-1 text-sm text-muted">
        A few voices need a quick check. Play the clip, then pick the person.
      </p>
      <div className="mt-4 flex flex-col gap-5">
        {pending.map((p) => (
          <div key={p.id} className="border-t border-line pt-4 first:border-0 first:pt-0">
            <p className="font-mono text-xs font-bold text-muted">
              Speaker {p.speaker_label}
            </p>
            {p.clip_url ? (
              <audio controls src={p.clip_url} className="mt-2 w-full" />
            ) : (
              <p className="mt-2 text-sm text-muted">No clip available.</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {(p.candidates.length
                ? p.candidates
                : people.map((x) => ({
                    person_id: x.id,
                    name: x.name,
                    score: 0,
                  }))
              ).map((c) => (
                <Button
                  key={c.person_id}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!isAdmin || busyId === p.id}
                  onClick={() => void confirm(p.id, c.person_id)}
                >
                  {c.name}
                  {c.score > 0 ? `, ${Math.round(c.score * 100)}%` : ""}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {msg ? <p className="mt-3 text-sm text-muted">{msg}</p> : null}
    </section>
  );
}
