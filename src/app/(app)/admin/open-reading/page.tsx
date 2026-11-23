"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type CaseRow = {
  id: string;
  number: number;
  title: string;
  readings: number;
  needingText: number;
};

export default function AdminOpenReadingPage() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const me = await fetch("/api/auth/me").then((r) => r.json());
    if (me.session?.role !== "tech_admin" || !me.session?.adminView) {
      setError("Tech admin and Admin switch required.");
      return;
    }
    const res = await fetch("/api/admin/open-reading");
    if (!res.ok) {
      setError("Could not load cases.");
      return;
    }
    const data = (await res.json()) as { cases: CaseRow[] };
    setCases(data.cases ?? []);
    setError(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(caseId: string, action: "find" | "prepare") {
    setBusyId(`${caseId}:${action}`);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/open-reading", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseId, action }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        added?: number;
        requested?: number;
        done?: number;
        failed?: number;
        skipped?: number;
        attempted?: number;
        note?: string;
      };
      if (!res.ok) {
        setStatus(body.error ?? "That request failed.");
        return;
      }
      if (action === "find") {
        setStatus(
          `Found ${body.added ?? 0} new reading${(body.added ?? 0) === 1 ? "" : "s"}, ${body.requested ?? 0} book request${(body.requested ?? 0) === 1 ? "" : "s"}.`,
        );
      } else {
        setStatus(
          `Prepared ${body.done ?? 0} of ${body.attempted ?? 0}. Failed ${body.failed ?? 0}, left for later ${body.skipped ?? 0}.`,
        );
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="animate-fade-up space-y-6">
      <div>
        <Link href="/admin" className="text-xs text-muted underline">
          Admin
        </Link>
        <h1 className="font-display text-3xl font-semibold">Open reading</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Jainam only. Find free deeper readings for a case, or prepare their
          text in advance so the reading room opens fast. Book requests from
          finds land under{" "}
          <Link href="/admin/books" className="underline">
            book uploads
          </Link>
          .
        </p>
      </div>

      {error ? <p className="text-sm text-cardinal">{error}</p> : null}
      {status ? <p className="text-sm text-ink">{status}</p> : null}

      <ul className="space-y-3">
        {cases.length === 0 && !error ? (
          <li className="text-sm text-muted">No active cases.</li>
        ) : (
          cases.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-white/70 px-4 py-3"
            >
              <div>
                <h2 className="font-display text-lg font-semibold">
                  Case {c.number}: {c.title}
                </h2>
                <p className="m-0 text-sm text-muted">
                  {c.readings} reading{c.readings === 1 ? "" : "s"}
                  {c.needingText > 0
                    ? `, ${c.needingText} still need text prepared`
                    : c.readings > 0
                      ? ", all prepared"
                      : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busyId !== null}
                  onClick={() => void run(c.id, "find")}
                >
                  {busyId === `${c.id}:find` ? "Finding..." : "Find readings"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={busyId !== null || c.needingText === 0}
                  onClick={() => void run(c.id, "prepare")}
                >
                  {busyId === `${c.id}:prepare` ? "Preparing..." : "Prepare all readings"}
                </Button>
              </div>
            </li>
          ))
        )}
      </ul>
    </main>
  );
}
