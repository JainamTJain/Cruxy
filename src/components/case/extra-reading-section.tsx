"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { Skeleton, SkeletonBlock } from "@/components/motion/skeleton";
import type { TruthItem } from "@/lib/case-brain/types";
import type { ExtraReadingItem } from "@/lib/case-home/extra-reading";
import { cn } from "@/lib/utils";
import { OpenReadingList } from "@/components/case/open-reading-list";

type Props = {
  caseId: string;
  teamId: string;
  truthItems: TruthItem[];
  canEdit: boolean;
  className?: string;
};

/** Items cut from notes can start mid-sentence; start them with a capital. */
function sentenceStart(text: string): string {
  const t = (text ?? "").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

const KIND_LABEL: Record<string, string> = {
  fact: "Fact",
  quote: "Quote",
  example: "Example",
  framework: "Framework",
  material: "Material",
  import: "Imported",
  case_fact: "Case fact",
  source: "Source",
};

/**
 * Extra reading: Evidence Library for this case, plus team imports
 * (optionally shared; other teams only see them after they choose to).
 */
export function ExtraReadingSection({
  caseId,
  teamId,
  truthItems,
  canEdit,
  className,
}: Props) {
  const [items, setItems] = useState<ExtraReadingItem[]>([]);
  const [available, setAvailable] = useState<ExtraReadingItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Show the skeleton only on first load; later refreshes stay quiet.
  const loadedOnce = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"file" | "link" | "paste">("file");
  const [link, setLink] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!loadedOnce.current) setLoading(true);
    setError(null);
    const res = await fetch(
      `/api/case/extra-reading?caseId=${encodeURIComponent(caseId)}&teamId=${encodeURIComponent(teamId)}`,
    );
    const json = (await res.json()) as {
      items?: ExtraReadingItem[];
      available_shared?: ExtraReadingItem[];
      error?: string;
    };
    if (!res.ok) {
      setError(json.error ?? "Could not load Extra reading.");
      loadedOnce.current = true;
      setLoading(false);
      return;
    }
    setItems(json.items ?? []);
    setAvailable(json.available_shared ?? []);
    loadedOnce.current = true;
    setLoading(false);
  }, [caseId, teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addImport() {
    if (busy) return;
    const fd = new FormData();
    fd.set("caseId", caseId);
    fd.set("teamId", teamId);
    if (title.trim()) fd.set("title", title.trim());
    if (mode === "file") {
      if (!file) return setError("Choose a file first.");
      if (file.size > 4.4 * 1024 * 1024) {
        return setError("Files over 4 MB can't be uploaded here. Use a web link, or paste the part you need.");
      }
      fd.set("file", file);
    } else if (mode === "link") {
      if (!/^https?:\/\//i.test(link.trim())) return setError("Paste a full web link starting with http.");
      fd.set("url", link.trim());
    } else {
      if (body.trim().length < 80) return setError("Paste a bit more text so Cruxy has something to digest.");
      fd.set("text", body);
    }
    setBusy(true);
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/case/extra-reading/import", { method: "POST", body: fd }).catch(() => null);
      const json = (await res?.json().catch(() => ({}))) as { error?: string; importId?: string };
      if (!res || !res.ok) {
        setError(json?.error ?? "Could not import that reading.");
        return;
      }
      setTitle("");
      setBody("");
      setLink("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } finally {
      setBusy(false);
      setImporting(false);
    }
  }

  async function toggleShare(importId: string, shared: boolean) {
    setBusy(true);
    try {
      await fetch("/api/case/extra-reading", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "share",
          importId,
          teamId,
          shared,
        }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function optIn(importId: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/case/extra-reading", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "opt_in",
          importId,
          caseId,
          teamId,
        }),
      });
      const json = (await res.json()) as {
        items?: ExtraReadingItem[];
        available_shared?: ExtraReadingItem[];
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? "Could not add that reading.");
        return;
      }
      setItems(json.items ?? []);
      setAvailable(json.available_shared ?? []);
    } finally {
      setBusy(false);
    }
  }

  const acceptedTruth = truthItems.filter((t) => t.status === "accepted");

  if (loading) {
    return (
      <div className={cn("flex flex-col gap-3", className)} aria-busy>
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-24 w-full" rounded="lg" />
        <SkeletonBlock lines={3} />
      </div>
    );
  }

  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <div>
        <h2 className="font-display m-0 text-xl font-extrabold">
          Extra reading
        </h2>
        <p className="mt-1 text-sm text-muted">
          Facts, quotes, examples, frameworks and materials for this case.
          Import your own; share only if you want other teams to be able to add
          it.
        </p>
      </div>

      {error ? <p className="m-0 text-sm text-cardinal">{error}</p> : null}

      {acceptedTruth.length === 0 && items.length === 0 ? (
        <p className="m-0 rounded-[20px] bg-white px-4 py-5 text-sm text-muted">
          Nothing here yet. Accepted Evidence Library items and imports show up
          here.
        </p>
      ) : null}

      {acceptedTruth.map((t) => (
        <article
          key={t.id}
          className="rounded-[20px] border border-[#E3E5E9] bg-white p-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-mist px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#3B404A]">
              {KIND_LABEL[t.kind] ?? t.kind}
            </span>
            <span className="text-[11px] text-muted">Evidence Library</span>
          </div>
          <p className="mt-2 m-0 text-sm leading-relaxed text-ink">{sentenceStart(t.text)}</p>
        </article>
      ))}

      {items.map((item) => (
        <article
          key={item.id}
          className="rounded-[20px] border border-[#E3E5E9] bg-white p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-mist px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#3B404A]">
                {KIND_LABEL[item.kind] ?? item.kind}
              </span>
              {item.origin === "shared" ? (
                <span className="text-[11px] text-muted">
                  From another team
                  {item.team_name ? `, ${item.team_name}` : ""}
                </span>
              ) : null}
              {item.origin === "own" && item.shared ? (
                <span className="text-[11px] font-semibold text-[#1F7A4D]">
                  Shared
                </span>
              ) : null}
            </div>
            {canEdit && item.origin === "own" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void toggleShare(item.id, !item.shared)}
                className="text-xs font-semibold text-cardinal underline disabled:opacity-50"
              >
                {item.shared ? "Stop sharing" : "Share with other teams"}
              </button>
            ) : null}
          </div>
          <h3 className="font-display m-0 mt-2 text-base font-extrabold">
            {item.title}
          </h3>
          {item.body ? (
            <p className="mt-1 m-0 text-sm leading-relaxed text-ink">
              {item.body}
            </p>
          ) : null}
          {item.digest ? (
            <div className="mt-2 rounded-xl bg-[#F7F8FA] px-3 py-2 text-sm">
              {item.digest.status === "done" && item.digest.summary ? (
                <>
                  <p className="m-0 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Cruxy&apos;s digest</p>
                  <p className="m-0 mt-1 leading-relaxed">{item.digest.summary}</p>
                  {item.digest.ideas?.length ? (
                    <p className="m-0 mt-1 text-[13px] text-muted">
                      {item.digest.ideas.length} idea{item.digest.ideas.length === 1 ? "" : "s"} Cruxy can bring into
                      your working document
                    </p>
                  ) : null}
                </>
              ) : item.digest.status === "pending" ? (
                <p className="m-0 text-muted">Cruxy is digesting this.</p>
              ) : (
                <p className="m-0 text-muted">{item.digest.error ?? "Cruxy could not digest this one."}</p>
              )}
            </div>
          ) : null}
          {item.digest && item.origin === "own" ? (
            <a
              href={`/case-brain/${caseId}/read/import/${item.id}`}
              className="mt-2 inline-flex min-h-9 items-center rounded-lg bg-ink px-3 text-xs font-semibold text-white"
            >
              Read in Crux
            </a>
          ) : null}
        </article>
      ))}

      {available.length > 0 ? (
        <div className="rounded-[20px] bg-[#F7F8FA] p-4">
          <h3 className="font-display m-0 text-base font-extrabold">
            Shared by other teams
          </h3>
          <p className="mt-1 text-xs text-muted">
            Add one only if you want it on your Extra reading.
          </p>
          <ul className="mt-3 m-0 list-none space-y-2 p-0">
            {available.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2"
              >
                <span className="text-sm font-semibold">
                  {a.title}
                  {a.team_name ? (
                    <span className="ml-2 text-xs font-normal text-muted">
                      {a.team_name}
                    </span>
                  ) : null}
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void optIn(a.id)}
                    className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Add
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canEdit ? (
        <form
          className="rounded-[20px] border border-dashed border-[#C9CCD3] bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void addImport();
          }}
        >
          <h3 className="font-display m-0 text-base font-extrabold">
            Import a reading
          </h3>
          <p className="m-0 mt-1 text-[13px] text-muted">
            A PDF, Word file, web page or pasted text. Cruxy reads all of it, digests it for this case and uses it
            in your working document suggestions. Only your team sees it unless you share it.
          </p>
          <div className="mt-3 flex gap-1 rounded-xl bg-[#F1F2F4] p-1" role="tablist">
            {([
              ["file", "Upload a file"],
              ["link", "Web link"],
              ["paste", "Paste text"],
            ] as const).map(([m, label]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  "flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold",
                  mode === m ? "bg-white text-ink shadow-sm" : "text-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === "file" ? (
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.txt,.md,.html,.htm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-3 block w-full text-sm"
            />
          ) : mode === "link" ? (
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              type="url"
              className="mt-3 h-10 w-full rounded-xl border border-mist bg-[#F7F8FA] px-3 text-sm"
              placeholder="https://..."
            />
          ) : (
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className="mt-3 w-full rounded-xl border border-mist bg-[#F7F8FA] px-3 py-2 text-sm"
              placeholder="Paste the article, chapter or notes"
            />
          )}
          <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-muted">
            Title (optional)
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-mist bg-[#F7F8FA] px-3 text-sm font-normal normal-case tracking-normal text-ink"
              placeholder="Cruxy names it if you leave this blank"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {importing ? "Cruxy is reading it..." : "Import and digest"}
          </button>
        </form>
      ) : null}

      <OpenReadingList caseId={caseId} />
    </section>
  );
}
