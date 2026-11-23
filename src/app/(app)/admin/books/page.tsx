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
  upload_path?: string | null;
  library_file_id?: string | null;
};

export default function BookRequestsPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatusMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [itemMsg, setItemMsg] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [showDone, setShowDone] = useState(false);
  const say = (id: string, ok: boolean, text: string) => setItemMsg((m) => ({ ...m, [id]: { ok, text } }));

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
    }).catch(() => null);
    if (!res?.ok) {
      say(id, false, "That did not save. Try again.");
      return;
    }
    say(id, true, status === "fulfilled" ? "Marked done." : status === "dismissed" ? "Dismissed." : "Reopened.");
    await load();
  }

  /** Books uploaded before Crux read PDFs: read the stored file now. */
  async function rereadBook(id: string, path: string) {
    setBusyId(id);
    say(id, true, "Cruxy is reading the stored book, this can take a minute or two...");
    try {
      const res = await fetch("/api/research/books", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "digest", id, path }),
      }).catch(() => null);
      const body = (await res?.json().catch(() => ({}))) as { error?: string; chars?: number; readable?: boolean };
      if (!res?.ok) {
        say(id, false, body?.error ?? "Could not read it. Try again.");
        return;
      }
      say(
        id,
        body.readable !== false,
        body.readable === false
          ? "The text could not be read (it may be a scanned PDF). Paste the chapter text instead."
          : `Done. Cruxy read ${Math.round((body.chars ?? 0) / 1000)}k characters; it is now in the case's Deeper reading with bookmarks.`,
      );
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function runResearch() {
    const res = await fetch("/api/research/run", { method: "POST" });
    if (res.ok) await load();
  }

  async function uploadPdf(id: string, file: File | null, text: string) {
    if (!file && !text.trim()) {
      say(id, false, "Pick a PDF or paste the chapter text.");
      return;
    }
    setBusyId(id);
    say(id, true, file ? `Uploading ${file.name}...` : "Saving the text...");
    try {
      let res: Response | null = null;
      if (file) {
        // Send the file straight to storage (no size limit from the server),
        // then ask Crux to read and index it.
        const signRes = await fetch("/api/research/books", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "sign", id, filename: file.name }),
        });
        const sign = (await signRes.json().catch(() => ({}))) as {
          direct?: boolean;
          signedUrl?: string;
          path?: string;
          error?: string;
        };
        if (!signRes.ok) {
          say(id, false, sign.error ?? "Could not start the upload.");
          return;
        }
        if (sign.direct && sign.signedUrl && sign.path) {
          const body = new FormData();
          body.append("cacheControl", "3600");
          body.append("", file);
          const put = await fetch(sign.signedUrl, { method: "PUT", body, headers: { "x-upsert": "true" } }).catch(() => null);
          if (!put?.ok) {
            say(id, false, `The file did not upload${put ? ` (error ${put.status})` : ""}. Check the connection and try again.`);
            return;
          }
          say(id, true, "Uploaded. Cruxy is reading the book now, this can take a minute or two...");
          res = await fetch("/api/research/books", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "digest", id, path: sign.path }),
          }).catch(() => null);
        }
      }
      if (!res) {
        const form = new FormData();
        form.set("id", id);
        if (file) form.set("file", file);
        if (text.trim()) form.set("text", text.trim());
        res = await fetch("/api/research/books", { method: "POST", body: form }).catch(() => null);
      }
      if (!res) {
        say(id, false, "Could not reach Crux. Try again.");
        return;
      }
      const raw = await res.text();
      let body: { error?: string; chars?: number; readable?: boolean } = {};
      try {
        body = JSON.parse(raw);
      } catch {
        body = { error: res.status === 413 ? "That file is too large to send this way." : raw.slice(0, 160) };
      }
      if (!res.ok) {
        say(id, false, body.error ?? "Upload failed.");
        return;
      }
      say(
        id,
        body.readable !== false,
        body.readable === false
          ? "Stored, but the text could not be read (it may be a scanned PDF). Paste the chapter text so Cruxy can use it."
          : `Done. Cruxy read ${Math.round((body.chars ?? 0) / 1000)}k characters and indexed it for the case.`,
      );
      await load();
    } finally {
      setBusyId(null);
    }
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
            Jainam only. Upload the PDF (any size) or paste the chapter. Cruxy
            reads it, indexes it for the case and adds it to the case&apos;s
            Deeper reading for the teams. Dr. B does not see these uploads.
            Paywalled papers and books from research also open{" "}
            <Link href="/admin/materials" className="underline">
              material requests
            </Link>
            .
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void runResearch()}>
          Run research now
        </Button>
      </div>

      {error ? <p className="text-sm text-cardinal">{error}</p> : null}
      {status ? <p className="text-sm text-ink">{status}</p> : null}

      <ul className="space-y-3">
        {books.length > 0 ? (
          <li className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
            <span>
              {books.filter((b) => b.status === "open" || (b.status === "fulfilled" && !b.library_file_id)).length} to
              do, {books.filter((b) => b.status === "fulfilled" && b.library_file_id).length} done
            </span>
            <button type="button" className="underline" onClick={() => setShowDone((v) => !v)}>
              {showDone ? "Hide done" : "Show done"}
            </button>
          </li>
        ) : null}
        {books.length === 0 && !error ? (
          <li className="text-sm text-muted">
            No book requests. Run research after a sync to seed gaps.
          </li>
        ) : (
          books
            .filter((b) => showDone || b.status === "open" || (b.status === "fulfilled" && !b.library_file_id))
            .map((b) => (
            <li
              key={b.id}
              className="rounded-2xl border border-ink/10 bg-white/70 px-4 py-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-lg font-semibold">{b.title}</h2>
                <span
                  className={
                    b.status === "fulfilled" && b.library_file_id
                      ? "rounded-full bg-[#E8F4EC] px-2 py-0.5 text-[11px] font-semibold text-[#1F5F3B]"
                      : b.status === "fulfilled"
                        ? "rounded-full bg-[#FFF4DE] px-2 py-0.5 text-[11px] font-semibold text-[#8A5200]"
                        : "rounded-full bg-[#F1F2F4] px-2 py-0.5 text-[11px] font-semibold text-[#3B404A]"
                  }
                >
                  {b.status === "fulfilled" && b.library_file_id
                    ? "Uploaded and read"
                    : b.status === "fulfilled"
                      ? "Marked done, no file yet"
                      : b.status === "dismissed"
                        ? "Dismissed"
                        : "Needs the book"}
                </span>
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
              {b.upload_path ? (
                <p className="mt-1 text-xs text-muted">
                  Stored: {b.upload_path}
                  {b.library_file_id ? " (digested)" : ""}
                </p>
              ) : null}

              {b.status === "open" || (b.status === "fulfilled" && !b.library_file_id) ? (
                <form
                  className="mt-3 space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    const file = fd.get("file");
                    const text = String(fd.get("text") ?? "");
                    void uploadPdf(
                      b.id,
                      file instanceof File && file.size > 0 ? file : null,
                      text,
                    );
                  }}
                >
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Upload PDF</span>
                    <input
                      name="file"
                      type="file"
                      accept="application/pdf,.pdf,text/plain"
                      className="block w-full text-sm"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">
                      Or paste chapter text
                    </span>
                    <textarea
                      name="text"
                      className="min-h-24 w-full rounded-xl border border-ink/10 px-3 py-2 text-sm"
                      placeholder="Paste the open chapter if you have text rights."
                    />
                  </label>
                  <Button type="submit" size="sm" disabled={busyId === b.id}>
                    {busyId === b.id ? "Uploading…" : "Upload and digest"}
                  </Button>
                </form>
              ) : null}

              {itemMsg[b.id] ? (
                <p className={`mt-2 text-sm ${itemMsg[b.id]!.ok ? "text-[#1F5F3B]" : "text-cardinal"}`} aria-live="polite">
                  {itemMsg[b.id]!.text}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {b.status === "open" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void setStatus(b.id, "fulfilled")}
                  >
                    Mark done without a file
                  </Button>
                ) : (
                  <Button type="button" size="sm" variant="outline" onClick={() => void setStatus(b.id, "open")}>
                    Reopen
                  </Button>
                )}
                {b.upload_path ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyId === b.id}
                    onClick={() => void rereadBook(b.id, b.upload_path!)}
                  >
                    {busyId === b.id ? "Reading..." : "Read it again and add to Deeper reading"}
                  </Button>
                ) : null}
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
