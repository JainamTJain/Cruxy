"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

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

type DriveStatus = {
  configured: boolean;
  hasServiceAccount: boolean;
  hasFolderId: boolean;
  stubReason: string | null;
};

export default function LibraryPage() {
  const [files, setFiles] = useState<FileCard[]>([]);
  const [drive, setDrive] = useState<DriveStatus | null>(null);
  const [latest, setLatest] = useState<{
    files_processed: number;
    files_skipped_unchanged: number;
    ai_calls: number;
    stub: boolean;
    finished_at: string | null;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [filesRes, syncRes] = await Promise.all([
      fetch("/api/library/files"),
      fetch("/api/library/sync"),
    ]);
    if (filesRes.ok) {
      const data = (await filesRes.json()) as { files: FileCard[] };
      setFiles(data.files);
    }
    if (syncRes.ok) {
      const data = (await syncRes.json()) as {
        drive: DriveStatus;
        latest: typeof latest;
      };
      setDrive(data.drive);
      setLatest(data.latest);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function syncNow() {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/library/sync", { method: "POST" });
    const data = (await res.json()) as {
      message?: string;
      error?: string;
      drive?: DriveStatus;
      run?: typeof latest;
    };
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error ?? "Sync failed");
      return;
    }
    setMessage(data.message ?? "Synced");
    if (data.drive) setDrive(data.drive);
    if (data.run) setLatest(data.run);
    await refresh();
  }

  return (
    <main className="animate-fade-up space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Library</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Ethics Bowl Drive, digested into citable passages. Cruxy answers from
            your own material first.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/library/search"
            className="rounded-xl border border-ink/15 bg-white/70 px-4 py-2 text-sm"
          >
            Search
          </Link>
          <Link
            href="/library/sorting"
            className="rounded-xl border border-ink/15 bg-white/70 px-4 py-2 text-sm"
          >
            Sorting queue
          </Link>
          <Button type="button" onClick={() => void syncNow()} disabled={busy}>
            {busy ? "Syncing…" : "Sync now"}
          </Button>
        </div>
      </div>

      {drive && !drive.configured ? (
        <p className="rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">
          {drive.stubReason ?? "Drive stub mode."} Share the folder with the
          service account, then set <code className="font-mono text-xs">DRIVE_ROOT_FOLDER_ID</code>.
        </p>
      ) : null}

      {message ? (
        <p className="text-sm text-ink/80">{message}</p>
      ) : null}

      {latest ? (
        <p className="text-xs text-muted">
          Last sync: processed {latest.files_processed}, skipped unchanged{" "}
          {latest.files_skipped_unchanged}, AI calls {latest.ai_calls}
          {latest.stub ? " · stub" : ""}
          {latest.finished_at
            ? ` · ${new Date(latest.finished_at).toLocaleString()}`
            : ""}
        </p>
      ) : null}

      <ul className="space-y-3">
        {files.length === 0 ? (
          <li className="text-sm text-muted">
            No files yet. Tap Sync now to pull the Drive (or sample stubs).
          </li>
        ) : (
          files.map((f) => (
            <li key={f.id}>
              <Link
                href={`/library/${f.id}`}
                className="block rounded-2xl border border-ink/10 bg-white/60 px-4 py-3 transition hover:border-cardinal/30 hover:bg-white/90"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-display text-lg font-semibold">{f.name}</h2>
                  <span className="font-mono text-[11px] text-muted">
                    {f.type ?? "untyped"}
                    {f.confidence != null
                      ? ` · ${f.confidence.toFixed(2)}`
                      : ""}
                    {f.status === "sorting_queue" ? " · queue" : ""}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {f.path}
                  {f.case_numbers.length
                    ? ` · cases ${f.case_numbers.join(", ")}`
                    : " · general"}
                  {f.scanned_pdf ? " · scanned PDF" : ""}
                </p>
                {f.card ? (
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-ink/70">
                    {f.card}
                  </pre>
                ) : null}
              </Link>
            </li>
          ))
        )}
      </ul>
    </main>
  );
}
