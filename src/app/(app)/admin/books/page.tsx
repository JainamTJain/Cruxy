"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Book = {
  id: string;
  title: string;
  reason: string | null;
  chapter: string | null;
  status: string;
  case_number: number | null;
  case_title: string | null;
  created_at: string;
};

export default function BookRequestsPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const me = await fetch("/api/auth/me").then((r) => r.json());
    if (me.session?.role !== "tech_admin" || !me.session?.adminView) {
      setError("Tech admin + Admin switch required.");
      return;
    }
    const res = await fetch("/api/research/books");
    if (!res.ok) {
      setError("Could not load book requests.");
      return;
    }
    const data = (await res.json()) as { books: Book[] };
    setBooks(data.books);
  }

  useEffect(() => {
    void load();
  }, []);

  async function setStatus(id: string, status: "fulfilled" | "dismissed" | "open") {
    const res = await fetch("/api/research/books", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) await load();
  }

  async function runResearch() {
    const res = await fetch("/api/research/run", { method: "POST" });
    if (res.ok) await load();
  }

  return (
    <main className="animate-fade-up space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/admin" className="text-xs text-muted underline">
            Admin
          </Link>
          <h1 className="font-display text-3xl font-semibold">Book requests</h1>
          <p className="mt-1 text-sm text-muted">
            Jainam only. Upload fulfilled PDFs to Drive Crux uploads (Track 1
            digests them on next sync).
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void runResearch()}>
          Run research now
        </Button>
      </div>

      {error ? <p className="text-sm text-cardinal">{error}</p> : null}

      <ul className="space-y-3">
        {books.length === 0 && !error ? (
          <li className="text-sm text-muted">
            No book requests. Run research after a sync to seed gaps.
          </li>
        ) : (
          books.map((b) => (
            <li
              key={b.id}
              className="rounded-2xl border border-ink/10 bg-white/70 px-4 py-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-lg font-semibold">{b.title}</h2>
                <span className="font-mono text-[11px] text-muted">{b.status}</span>
              </div>
              {b.case_number != null ? (
                <p className="text-xs text-muted">
                  Case {b.case_number}: {b.case_title}
                </p>
              ) : null}
              {b.chapter ? (
                <p className="mt-1 text-sm">Chapter: {b.chapter}</p>
              ) : null}
              {b.reason ? (
                <p className="mt-1 text-sm text-ink/80">{b.reason}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void setStatus(b.id, "fulfilled")}
                >
                  Mark fulfilled
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void setStatus(b.id, "dismissed")}
                >
                  Dismiss
                </Button>
              </div>
            </li>
          ))
        )}
      </ul>
    </main>
  );
}
