"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageIntro } from "@/components/page-intro";

type Row = {
  id: string;
  person_id: string;
  kind: string;
  page_path: string;
  what_doing: string;
  details: string | null;
  screenshot_path: string | null;
  status: string;
  admin_note: string | null;
  fixed_at: string | null;
  created_at: string;
};

export default function AdminFeedbackPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  async function load() {
    const me = await fetch("/api/auth/me").then((r) => r.json());
    if (me.session?.role !== "tech_admin" || !me.session?.adminView) {
      setError(
        "Only Jainam can open this queue. Turn on Admin view as tech admin.",
      );
      return;
    }
    const people = await fetch("/api/auth/people").then((r) => r.json());
    const map: Record<string, string> = {};
    for (const p of (people.people ?? []) as { id: string; name: string }[]) {
      map[p.id] = p.name;
    }
    setNames(map);

    const res = await fetch("/api/help/feedback");
    if (!res.ok) {
      setError("Could not load feedback. Refresh and try again.");
      return;
    }
    const data = (await res.json()) as { feedback: Row[] };
    setRows(data.feedback);
    setError(null);
  }

  useEffect(() => {
    void load();
  }, []);

  async function setStatus(id: string, status: string) {
    const res = await fetch("/api/help/feedback", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) await load();
  }

  return (
    <main className="animate-fade-up space-y-6">
      <div>
        <Link href="/admin" className="text-xs text-muted underline">
          Admin
        </Link>
        <PageIntro title="Feedback queue">
          Problems and suggestions from the Report button. Mark fixed to notify
          the person in Crux.
        </PageIntro>
      </div>

      {error ? <p className="text-sm text-cardinal">{error}</p> : null}

      <ul className="space-y-3">
        {rows.length === 0 && !error ? (
          <li className="text-sm text-muted">
            No reports yet. The Report button on every page feeds this list.
          </li>
        ) : (
          rows.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl border border-ink/10 bg-white/70 px-4 py-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <strong className="font-display text-base">
                  {r.kind === "suggestion" ? "Suggestion" : "Problem"}
                  {", "}
                  {names[r.person_id] ?? "Someone"}
                </strong>
                <span className="text-xs uppercase tracking-wide text-muted">
                  {r.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                {r.page_path}
                {", "}
                {new Date(r.created_at).toLocaleString()}
              </p>
              <p className="mt-2 text-sm">{r.what_doing}</p>
              {r.details ? (
                <p className="mt-1 text-sm text-muted">{r.details}</p>
              ) : null}
              {r.screenshot_path ? (
                <p className="mt-1 text-xs text-muted">
                  Screenshot saved ({r.screenshot_path})
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {r.status !== "fixed" ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void setStatus(r.id, "fixed")}
                  >
                    Mark fixed
                  </Button>
                ) : null}
                {r.status !== "open" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void setStatus(r.id, "open")}
                  >
                    Reopen
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void setStatus(r.id, "wont_fix")}
                >
                  Won&apos;t fix
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void setStatus(r.id, "duplicate")}
                >
                  Duplicate
                </Button>
              </div>
            </li>
          ))
        )}
      </ul>
    </main>
  );
}
