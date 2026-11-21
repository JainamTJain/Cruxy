"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type FileCard = {
  id: string;
  name: string;
  path: string | null;
  type: string | null;
  confidence: number | null;
  case_numbers: number[];
  status: string;
  card: string | null;
  scanned_pdf: boolean;
};

export default function SortingQueuePage() {
  const [files, setFiles] = useState<FileCard[]>([]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/library/files?queue=1");
      if (!res.ok) return;
      const data = (await res.json()) as { files: FileCard[] };
      setFiles(data.files);
    })();
  }, []);

  return (
    <main className="animate-fade-up space-y-6">
      <div>
        <Link href="/library" className="text-xs text-muted underline">
          Library
        </Link>
        <h1 className="font-display text-3xl font-semibold">Sorting queue</h1>
        <p className="mt-1 text-sm text-muted">
          Files under 0.7 confidence (or scanned PDFs) wait for Jainam to confirm
          case tags and type.
        </p>
      </div>

      <ul className="space-y-3">
        {files.length === 0 ? (
          <li className="text-sm text-muted">Queue is empty.</li>
        ) : (
          files.map((f) => (
            <li
              key={f.id}
              className="rounded-2xl border border-cardinal/20 bg-white/70 px-4 py-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/library/${f.id}`}
                  className="font-display text-lg font-semibold hover:text-cardinal"
                >
                  {f.name}
                </Link>
                <span className="font-mono text-xs text-cardinal">
                  {(f.confidence ?? 0).toFixed(2)}
                  {f.scanned_pdf ? ", scanned" : ""}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">{f.path}</p>
              {f.card ? (
                <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-ink/70">
                  {f.card}
                </pre>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </main>
  );
}
