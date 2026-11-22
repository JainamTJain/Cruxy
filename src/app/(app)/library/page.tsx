"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LoadingGenie } from "@/components/cruxy/mood/loading-genie";
import { useCruxy } from "@/components/cruxy/cruxy-context";

type FileCard = {
  id: string;
  name: string;
  path: string | null;
  type: string | null;
  confidence: number | null;
  case_numbers: number[];
  case_ids?: string[];
  status: string;
  scanned_pdf: boolean;
  what?: string | null;
  points?: string[];
  questions?: string[];
  speakers?: { who: string; line: string }[];
};

type SyncLatest = {
  files_seen?: number;
  files_processed: number;
  files_skipped_unchanged: number;
  ai_calls: number;
  stub: boolean;
  finished_at: string | null;
  notes: string | null;
  mode?: string;
};

type UnreadableRow = {
  id: string;
  name: string;
  path: string | null;
  kindLabel: string;
  whatToDo: string;
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
  const [connectSteps, setConnectSteps] = useState<string[]>([]);
  const [writeEnabled, setWriteEnabled] = useState(false);
  const [writeMessage, setWriteMessage] = useState<string | null>(null);
  const [latest, setLatest] = useState<SyncLatest | null>(null);
  const [unreadables, setUnreadables] = useState<UnreadableRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [filesRes, syncRes] = await Promise.all([
      fetch("/api/library/files"),
      fetch("/api/library/sync"),
    ]);
    if (filesRes.ok) {
      const data = (await filesRes.json()) as {
        files: FileCard[];
        unreadables?: UnreadableRow[];
      };
      setFiles(data.files);
      setUnreadables(data.unreadables ?? []);
    }
    if (syncRes.ok) {
      const data = (await syncRes.json()) as {
        drive: DriveStatus;
        latest: SyncLatest | null;
        canSync?: boolean;
        connectSteps?: string[];
        writeEnabled?: boolean;
        writeMessage?: string;
      };
      setDrive(data.drive);
      setLatest(data.latest);
      setCanSync(Boolean(data.canSync));
      setConnectSteps(data.connectSteps ?? []);
      setWriteEnabled(Boolean(data.writeEnabled));
      setWriteMessage(data.writeMessage ?? null);
    }
    setLoading(false);
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

  async function uploadFile(file: File) {
    setBusy(true);
    setMessage(null);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/library/upload", {
      method: "POST",
      body,
    });
    const data = (await res.json()) as {
      ok?: boolean;
      message?: string;
      error?: string;
      hint?: string;
    };
    setBusy(false);
    if (!res.ok || data.ok === false) {
      setMessage(
        [data.error ?? data.message ?? "Upload failed", data.hint]
          .filter(Boolean)
          .join(" "),
      );
      return;
    }
    setMessage(data.message ?? "Uploaded");
    setMood("happy");
    await refresh();
  }

  const featured =
    files.find((f) => f.case_numbers.includes(9)) ??
    files.find((f) => /GEM|case set|Rosetta/i.test(f.name)) ??
    files[0];

  const emptyDrive = files.length === 0;

  if (loading) {
    return (
      <main className="min-h-[320px]">
        <LoadingGenie label="Opening library…" />
      </main>
    );
  }

  return (
    <main className="animate-fade-up flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
            Library from Drive
          </span>
          <h1 className="font-display mt-1 text-[40px] font-extrabold leading-none tracking-[-0.03em]">
            Library
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Short takes from the Ethics Bowl Drive, organised by case. Open a
            file to read it on the case page.
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
              {busy ? "Working…" : "Sync now"}
            </button>
          ) : null}
          {canSync ? (
            <>
              <input
                ref={fileInput}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadFile(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
                className="rounded-xl border border-[#E3E5E9] bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                title={writeMessage ?? undefined}
              >
                Upload to Drive
              </button>
            </>
          ) : null}
        </div>
      </div>

      {emptyDrive || (drive && !drive.configured) ? (
        <section className="rounded-2xl border border-gold/40 bg-gold/10 px-4 py-4 text-sm">
          <h2 className="font-display m-0 text-lg font-extrabold">
            {emptyDrive && drive?.configured
              ? "Drive connected, nothing digested yet"
              : "Connect the Ethics Bowl Drive (once)"}
          </h2>
          <p className="mt-2 text-ink/80">
            There is no Google sign-in in Crux. Jainam shares the folder with the
            service account, then the tech admin taps Sync now.
          </p>
          {drive?.stubReason ? (
            <p className="mt-2 text-cardinal">{drive.stubReason}</p>
          ) : null}
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-ink/90">
            {(connectSteps.length
              ? connectSteps
              : [
                  `Share the Ethics Bowl folder with ${drive?.serviceAccountEmail ?? "the service account"} as Viewer.`,
                  "Confirm Vercel has GOOGLE_SERVICE_ACCOUNT_JSON and DRIVE_ROOT_FOLDER_ID.",
                  "Sign in as tech admin and tap Sync now on this page.",
                ]
            ).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {canSync ? (
            <button
              type="button"
              onClick={() => void syncNow()}
              disabled={busy}
              className="mt-4 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Syncing…" : "Sync now"}
            </button>
          ) : (
            <p className="mt-3 text-xs text-muted">
              Sync now is tech admin only. Ask Jainam to run it after sharing.
            </p>
          )}
        </section>
      ) : null}

      {writeMessage && canSync ? (
        <p className="text-xs text-muted">{writeMessage}</p>
      ) : null}

      {message ? (
        <p
          className={`rounded-2xl px-4 py-3 text-sm ${
            /failed|not visible|missing|could not|refused/i.test(message)
              ? "border border-cardinal/30 bg-cardinal/10 text-cardinal"
              : "bg-white text-ink/80"
          }`}
        >
          {message}
        </p>
      ) : null}

      <section className="rounded-[20px] border border-[#E3E5E9] bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display m-0 text-lg font-extrabold">
              Drive sync status
            </h2>
            <p className="mt-1 text-sm text-muted">
              Last run, files seen, processed, skipped, and notes.
            </p>
          </div>
          {canSync ? (
            <button
              type="button"
              onClick={() => void syncNow()}
              disabled={busy}
              className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Syncing…" : "Sync now"}
            </button>
          ) : (
            <span className="text-xs text-muted">Sync now: tech admin</span>
          )}
        </div>
        {latest ? (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted">Last run</dt>
              <dd className="font-semibold">
                {latest.finished_at
                  ? new Date(latest.finished_at).toLocaleString()
                  : "In progress"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Files seen</dt>
              <dd className="font-semibold">
                {latest.files_seen != null ? latest.files_seen : "n/a"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Processed</dt>
              <dd className="font-semibold">{latest.files_processed}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Skipped</dt>
              <dd className="font-semibold">{latest.files_skipped_unchanged}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-muted">No sync run yet.</p>
        )}
        {latest?.notes ? (
          <p className="mt-3 text-sm text-ink/80">Notes: {latest.notes}</p>
        ) : null}
        {latest?.stub ? (
          <p className="mt-1 text-xs text-muted">Offline digest this run.</p>
        ) : null}
        {writeEnabled ? (
          <p className="mt-1 text-xs text-muted">Writeback on.</p>
        ) : null}
      </section>

      {unreadables.length > 0 ? (
        <section className="rounded-[20px] border border-cardinal/25 bg-cardinal/5 p-4 sm:p-5">
          <h2 className="font-display m-0 text-lg font-extrabold">
            Could not read as text
          </h2>
          <p className="mt-1 text-sm text-muted">
            Scanned PDFs, slides, and images need a text version in Drive.
          </p>
          <ul className="mt-3 space-y-3">
            {unreadables.map((u) => (
              <li
                key={u.id}
                className="rounded-xl border border-[#E3E5E9] bg-white px-3 py-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link
                    href={`/library/${u.id}`}
                    className="font-semibold hover:underline"
                  >
                    {u.name}
                  </Link>
                  <span className="text-[11px] font-bold uppercase tracking-wide text-cardinal">
                    {u.kindLabel}
                  </span>
                </div>
                {u.path ? (
                  <p className="mt-0.5 text-xs text-muted">{u.path}</p>
                ) : null}
                <p className="mt-1.5 text-sm text-ink/85">{u.whatToDo}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {featured ? (
        <Link
          href={`/library/${featured.id}`}
          className="block rounded-[20px] bg-ink p-6 text-white transition hover:bg-[#1E2129]"
        >
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-gold">
            Start here
          </span>
          <h2 className="font-display mt-2 text-2xl font-extrabold">
            {featured.name}
          </h2>
          <p className="mt-1 text-sm text-[#9AA0AA]">
            {featured.what
              ? featured.what
              : featured.case_numbers.length
                ? `Cases ${featured.case_numbers.join(", ")}`
                : "General"}
          </p>
        </Link>
      ) : null}

      <ul className="space-y-3">
        {files.length === 0 ? (
          <li className="rounded-2xl bg-white px-4 py-6 text-sm text-muted">
            No files yet. Follow the connect steps above, then Sync now.
          </li>
        ) : (
          files.map((f) => {
            const href =
              f.case_ids?.[0]
                ? `/case-brain/${f.case_ids[0]}?tab=readings&file=${f.id}`
                : `/library/${f.id}`;
            return (
              <li key={f.id}>
                <Link
                  href={href}
                  className="block rounded-[20px] border border-[#E3E5E9] bg-white px-4 py-3 transition hover:border-cardinal/30"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-display text-lg font-extrabold">
                      {f.name}
                    </h2>
                    <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
                      {f.type?.replace(/_/g, " ") ?? "file"}
                      {f.case_numbers.length
                        ? ` · case ${f.case_numbers.join(", ")}`
                        : ""}
                    </span>
                  </div>
                  {f.what ? (
                    <p className="mt-1.5 text-sm text-ink/85">{f.what}</p>
                  ) : null}
                  {(f.points?.length ?? 0) > 0 ? (
                    <ul className="mt-2 m-0 list-none space-y-1 p-0">
                      {f.points!.slice(0, 2).map((p) => (
                        <li
                          key={p}
                          className="rounded-lg bg-[#F7F8FA] px-2.5 py-1.5 text-xs text-[#3B404A]"
                        >
                          {p}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {(f.questions?.length ?? 0) > 0 ? (
                    <p className="mt-2 text-xs text-muted">
                      Open: {f.questions![0]}
                    </p>
                  ) : null}
                </Link>
              </li>
            );
          })
        )}
      </ul>
    </main>
  );
}
