"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ActivityEntry = {
  id: string;
  action: string;
  personName: string;
  target: string | null;
  at: string;
};

export default function AdminPage() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [readOnly, setReadOnly] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const me = await fetch("/api/auth/me").then((r) => r.json());
      setRole(me.session?.role ?? null);
      if (!me.session?.adminView) {
        setError("Turn on Admin switch first.");
        return;
      }
      const res = await fetch("/api/admin/activity");
      if (!res.ok) {
        setError("Could not load activity log.");
        return;
      }
      const data = (await res.json()) as {
        entries: ActivityEntry[];
        readOnly: boolean;
      };
      setEntries(data.entries);
      setReadOnly(data.readOnly);
    })();
  }, []);

  return (
    <main className="animate-fade-up space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">Admin console</h1>
        <p className="mt-1 text-sm text-muted">
          Activity log + passcodes. Book requests (tech admin) are Track 1;
          sessions and spend land in Track 6.
        </p>
      </div>

      {error ? <p className="text-sm text-cardinal">{error}</p> : null}

      {role === "tech_admin" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-2xl border border-ink/10 bg-white/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-cardinal">
              Only Jainam
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold">Passcodes</h2>
            <p className="mt-1 text-sm text-muted">
              Reveal for 20 seconds, reset to a one-time code, change starter for
              new members.
            </p>
            <Link
              href="/admin/passcodes"
              className="mt-3 inline-flex rounded-xl bg-cardinal px-4 py-2 text-sm text-white"
            >
              Open Passcodes panel
            </Link>
          </section>
          <section className="rounded-2xl border border-ink/10 bg-white/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-cardinal">
              Only Jainam
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold">
              Book requests
            </h2>
            <p className="mt-1 text-sm text-muted">
              Nightly research files titles Cruxy wants; you fulfill or dismiss.
            </p>
            <Link
              href="/admin/books"
              className="mt-3 inline-flex rounded-xl bg-ink px-4 py-2 text-sm text-white"
            >
              Open book requests
            </Link>
          </section>
        </div>
      ) : null}

      <section>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">Activity log</h2>
          {readOnly ? (
            <span className="text-xs text-muted">Dr. B: read only</span>
          ) : null}
        </div>
        <ul className="mt-3 space-y-2">
          {entries.length === 0 ? (
            <li className="text-sm text-muted">No entries yet.</li>
          ) : (
            entries.map((e) => (
              <li
                key={e.id}
                className="rounded-xl border border-ink/5 bg-white/50 px-3 py-2 text-sm"
              >
                <span className="font-mono text-xs text-muted">
                  {new Date(e.at).toLocaleString()}
                </span>{" "}
                <span className="font-medium">{e.personName}</span>{" "}
                <span className="text-muted">{e.action}</span>
                {e.target ? (
                  <span className="font-mono text-xs text-muted"> · {e.target.slice(0, 8)}</span>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </section>
    </main>
  );
}
