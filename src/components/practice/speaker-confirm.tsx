"use client";

import { useEffect, useState } from "react";

type Mapping = { speaker_label: string; person_id: string | null };
type Person = { id: string; name: string };

type Props = {
  roundId: string;
  people: Person[];
  isAdmin: boolean;
};

/**
 * F-218: after a room recording, admin confirms speaker labels
 * (pre-filled from voice samples and round roles).
 */
export function SpeakerConfirmPanel({ roundId, people, isAdmin }: Props) {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    void fetch(`/api/practice/rounds/${roundId}/speakers`)
      .then((r) => r.json())
      .then((d: { speakers?: { mappings?: Mapping[]; confirmed_at?: string | null } }) => {
        const m = d.speakers?.mappings ?? [];
        setMappings(m);
        setConfirmed(Boolean(d.speakers?.confirmed_at));
      })
      .catch(() => undefined);
  }, [roundId]);

  async function save() {
    setMsg(null);
    const res = await fetch(`/api/practice/rounds/${roundId}/speakers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mappings }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Could not save labels");
      return;
    }
    setConfirmed(true);
    setMsg("Speaker labels confirmed.");
  }

  if (!mappings.length) {
    return (
      <section className="rounded-[20px] bg-white p-[22px]">
        <h2 className="font-display m-0 text-[22px] font-extrabold">
          Speaker labels
        </h2>
        <p className="mt-2 text-sm text-muted">
          Labels appear here after the transcript is ready. Cruxy pre-fills from
          voices and round roles.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[20px] bg-white p-[22px]">
      <h2 className="font-display m-0 text-[22px] font-extrabold">
        Confirm who spoke
      </h2>
      <p className="mt-1 text-sm text-muted">
        One mic in the room. Check each label before the report is locked in.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        {mappings.map((m, i) => (
          <label key={m.speaker_label} className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-mono text-xs font-bold text-muted">
              {m.speaker_label}
            </span>
            <select
              className="h-10 min-w-[180px] rounded-xl border border-line bg-white px-3"
              disabled={!isAdmin || confirmed}
              value={m.person_id ?? ""}
              onChange={(e) => {
                const next = [...mappings];
                next[i] = {
                  speaker_label: m.speaker_label,
                  person_id: e.target.value || null,
                };
                setMappings(next);
              }}
            >
              <option value="">Not set</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {isAdmin && !confirmed ? (
        <button
          type="button"
          onClick={() => void save()}
          className="mt-4 h-11 rounded-xl bg-ink px-[18px] text-sm font-semibold text-white"
        >
          Confirm labels
        </button>
      ) : null}
      {msg ? <p className="mt-2 text-sm text-muted">{msg}</p> : null}
    </section>
  );
}
