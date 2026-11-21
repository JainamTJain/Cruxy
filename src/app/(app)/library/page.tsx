"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useCruxy } from "@/components/cruxy/cruxy-context";

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
  serviceAccountEmail?: string;
};

export default function LibraryPage() {
  const { setMood } = useCruxy();
  const [files, setFiles] = useState<FileCard[]>([]);
  const [drive, setDrive] = useState<DriveStatus | null>(null);
  const [canSync, setCanSync] = useState(false);
  const [latest, setLatest] = useState<{
    files_processed: number;
    files_skipped_unchanged: number;
    ai_calls: number;
    stub: boolean;
    finished_at: string | null;
    notes: string | null;
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
        canSync?: boolean;
      };
      setDrive(data.drive);
      setLatest(data.latest);
      setCanSync(Boolean(data.canSync));
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
      newFilesArrived?: boolean;
      ok?: boolean;
    };
    setBusy(false);
    if (!res.ok || data.ok === false) {
      setMessage(data.error ?? data.message ?? "Sync failed");
      return;
    }
    setMessage(data.message ?? "Synced");
    if (data.drive) setDrive(data.drive);
    if (data.run) setLatest(data.run);
    if (data.newFilesArrived) setMood("surprised");
    await refresh();
  }

  // Prefer Case 9 / GEM file for the Reading room entry point
  const featured =
    files.find((f) => f.case_numbers.includes(9)) ??
    files.find((f) => /GEM|case set|Rosetta/i.test(f.name)) ??
    files[0];

  return (
    <main className="animate-fade-up flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
            Library · Drive
          </span>
          <h1 className="font-display mt-1 text-[40px] font-extrabold leading-none tracking-[-0.03em]">
            Reading room
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Ethics Bowl Drive, digested into citable passages. Open a file beside
            its case set page.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/library/search"
            className="rounded-xl border border-[#E3E5E9] bg-white px-4 py-2.5 text-sm font-semibold"
          >
            Search
          </Link>
          <Link
            href="/library/sorting"
            className="rounded-xl border border-[#E3E5E9] bg-white px-4 py-2.5 text-sm font-semibold"
          >
            Sorting queue
          </Link>
          {canSync ? (
            <button
              type="button"
              onClick={() => void syncNow()}
              disabled={busy}
              className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Syncing…" : "Sync now"}
            </button>
          ) : null}
        </div>
      </div>

      {drive && !drive.configured ? (
        <p className="rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">
          {drive.stubReason ?? "Drive stub mode."} Share the folder with{" "}
          <code className="font-mono text-xs">
            {drive.serviceAccountEmail ?? "crux-drive-reader@…"}
          </code>{" "}
          as Viewer.
        </p>
      ) : null}

      {message ? (
        <p
          className={`rounded-2xl px-4 py-3 text-sm ${
            /failed|not visible|missing|could not/i.test(message)
              ? "border border-cardinal/30 bg-cardinal/10 text-cardinal"
              : "bg-white text-ink/80"
          }`}
        >
          {message}
        </p>
      ) : null}

      {latest ? (
        <p className="text-xs text-muted">
          Last sync: processed {latest.files_processed}, skipped unchanged{" "}
          {latest.files_skipped_unchanged}, AI calls {latest.ai_calls}
          {latest.stub ? " · stub" : ""}
          {latest.finished_at
            ? ` · ${new Date(latest.finished_at).toLocaleString()}`
            : ""}
          {latest.notes ? ` · ${latest.notes}` : ""}
        </p>
      ) : null}

      {featured ? (
        <Link
          href={`/library/${featured.id}`}
          className="block rounded-[20px] bg-ink p-6 text-white transition hover:bg-[#1E2129]"
        >
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-gold">
            Open reading room
          </span>
          <h2 className="font-display mt-2 text-2xl font-extrabold">
            {featured.name}
          </h2>
          <p className="mt-1 text-sm text-[#9AA0AA]">
            {featured.case_numbers.length
              ? `Cases ${featured.case_numbers.join(", ")}`
              : "General"}
            {featured.path ? ` · ${featured.path}` : ""}
          </p>
        </Link>
      ) : null}

      <ul className="space-y-3">
        {files.length === 0 ? (
          <li className="rounded-2xl bg-white px-4 py-6 text-sm text-muted">
            No files yet.
            {canSync
              ? " Tap Sync now to pull the Drive."
              : " Ask Jainam to Sync now (tech admin)."}
          </li>
        ) : (
          files.map((f) => (
            <li key={f.id}>
              <Link
                href={`/library/${f.id}`}
                className="block rounded-[20px] border border-[#E3E5E9] bg-white px-4 py-3 transition hover:border-cardinal/30"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-display text-lg font-extrabold">
                    {f.name}
                  </h2>
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
