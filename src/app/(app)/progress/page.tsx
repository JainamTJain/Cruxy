"use client";

/**
 * Personal progress surface. Wave 9 D owns the fuller page (goals, reflection).
 * Wave 9 E seeds peer notes (kudos) here so they have a home from day one.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { PeerKudos } from "@/lib/team/calendar-types";

type Person = { id: string; name: string };

export default function ProgressPage() {
  const [kudos, setKudos] = useState<PeerKudos[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [kRes, pRes] = await Promise.all([
      fetch("/api/team/kudos?mine=1"),
      fetch("/api/auth/people"),
    ]);
    if (kRes.ok) {
      const d = (await kRes.json()) as { kudos: PeerKudos[] };
      setKudos(d.kudos ?? []);
    }
    if (pRes.ok) {
      const d = (await pRes.json()) as { people?: Person[] };
      const map: Record<string, string> = {};
      for (const p of d.people ?? []) map[p.id] = p.name;
      setNames(map);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="animate-fade-up flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
          You
        </span>
        <h1 className="font-display m-0 text-[40px] font-extrabold leading-none tracking-[-0.02em] max-md:text-[32px]">
          Progress
        </h1>
        <p className="m-0 max-w-xl text-sm text-muted">
          Notes from teammates after rounds. Compared only with your own past,
          never a leaderboard.
        </p>
      </div>

      <section className="rounded-[20px] bg-white p-4">
        <h2 className="font-display m-0 text-lg font-extrabold">
          Notes for you
        </h2>
        <ul className="mt-3 m-0 list-none divide-y divide-[#ECEEF1] p-0">
          {kudos.map((k) => (
            <li key={k.id} className="py-3 text-sm">
              <p className="m-0 font-semibold text-ink">
                From {names[k.from_person_id] ?? "a teammate"}
              </p>
              <p className="m-0 mt-1 text-muted">{k.body}</p>
              <p className="m-0 mt-1 text-[11px] text-muted">
                {new Date(k.created_at).toLocaleString()}
              </p>
            </li>
          ))}
          {!kudos.length ? (
            <li className="py-4 text-sm text-muted">
              No notes yet. After a round, teammates can send one from{" "}
              <Link
                href="/team/kudos"
                className="font-semibold text-cardinal underline"
              >
                Kudos
              </Link>
              .
            </li>
          ) : null}
        </ul>
      </section>

      <p className="m-0 text-sm text-muted">
        Goals with Dr. B and round reflections will land here next.
      </p>
    </div>
  );
}
