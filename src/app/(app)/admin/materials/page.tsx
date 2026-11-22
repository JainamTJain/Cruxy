"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Material = {
  id: string;
  title: string;
  citation: string;
  why_it_matters: string;
  where_to_look: string | null;
  claim_ref: string | null;
  status: string;
  doi: string | null;
  url: string | null;
  case_number: number | null;
  case_title: string | null;
  created_at: string;
};

export default function MaterialRequestsPage() {
  const [rows, setRows] = useState<Material[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const me = await fetch("/api/auth/me").then((r) => r.json());
    if (me.session?.role !== "tech_admin" || !me.session?.adminView) {
      setError("Tech admin + Admin switch required.");
      return;
    }
    const res = await fetch("/api/research/materials");
    if (!res.ok) {
      setError("Could not load material requests.");
      return;
    }
    const data = (await res.json()) as { materials: Material[] };
    setRows(data.materials);
  }

  useEffect(() => {
    void load();
  }, []);

  async function setStatus(id: string, status: "fulfilled" | "dismissed" | "open") {
    const res = await fetch("/api/research/materials", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) await load();
  }

  return (
    <main className="animate-fade-up space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/admin" className="text-xs text-muted underline">
            Admin
          </Link>
          <h1 className="font-display text-3xl font-semibold">
            Material requests
          </h1>
          <p className="mt-1 text-sm text-muted">
            Paywalled papers and books Cruxy needs. Fetch via USC Libraries or
            the publisher. Requests close when a matching file appears in the
            Ethics Bowl Drive after sync. Also see{" "}
            <Link href="/admin/books" className="underline">
              book uploads
            </Link>
            .
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void fetch("/api/research/run", { method: "POST" }).then(load)}
        >
          Run research now
        </Button>
      </div>

      {error ? <p className="text-sm text-cardinal">{error}</p> : null}

      <ul className="space-y-3">
        {rows.length === 0 && !error ? (
          <li className="text-sm text-muted">
            No material requests yet. Nightly research opens them when a source
            matters but is paywalled or a book.
          </li>
        ) : (
          rows.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl border border-ink/10 bg-white/70 px-4 py-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-lg font-semibold">{r.title}</h2>
                <span className="font-mono text-[11px] text-muted">{r.status}</span>
              </div>
              {r.case_number != null ? (
                <p className="text-xs text-muted">
                  Case {r.case_number}: {r.case_title}
                  {r.claim_ref ? `. ${r.claim_ref}` : ""}
                </p>
              ) : null}
              <p className="mt-1 text-sm text-ink">{r.why_it_matters}</p>
              <p className="mt-1 text-xs text-muted">{r.citation}</p>
              {r.where_to_look ? (
                <p className="mt-1 text-xs text-muted">
                  Where to look: {r.where_to_look}
                </p>
              ) : null}
              {r.url ? (
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex text-sm text-cardinal underline"
                >
                  Source link
                </a>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {r.status !== "fulfilled" ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void setStatus(r.id, "fulfilled")}
                  >
                    Mark done
                  </Button>
                ) : null}
                {r.status !== "dismissed" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void setStatus(r.id, "dismissed")}
                  >
                    Dismiss
                  </Button>
                ) : null}
                {r.status !== "open" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void setStatus(r.id, "open")}
                  >
                    Reopen
                  </Button>
                ) : null}
              </div>
            </li>
          ))
        )}
      </ul>
    </main>
  );
}
