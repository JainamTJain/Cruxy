"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Split = {
  id: string;
  kind: "found" | "not_in_regional" | "unmatched";
  case_number: number | null;
  case_id: string | null;
  title_guess: string | null;
  body_text: string;
  assigned_case_id: string | null;
};
type CaseLite = { id: string; number: number; title: string };
type Review = { batchId?: string; batch?: { id: string; status: string } | null; splits: Split[]; cases: CaseLite[] };
type Source = { key: string; title: string; text?: string; driveUrl?: string };

/**
 * Cases tab: a team brings its own working documents. Cruxy sorts them case
 * by case and into the six sections; Cruxy and the other teams' vetted ideas
 * keep coming in as suggestions on top of the team's own document.
 */
export function TeamDocImport({ startOpen = false }: { startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [sources, setSources] = useState<Source[]>([]);
  const [link, setLink] = useState("");
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [replace, setReplace] = useState(true);
  const [done, setDone] = useState<{ filledCases: number } | null>(null);

  // Pick up an import a teammate started but did not confirm.
  useEffect(() => {
    if (!open) return;
    void fetch("/api/team/import-documents")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Review | null) => {
        if (j?.batch && j.batch.status === "review" && j.splits?.length) setReview({ ...j, batchId: j.batch.id });
      })
      .catch(() => undefined);
  }, [open]);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    for (const f of Array.from(files)) {
      setBusy(`Reading ${f.name}...`);
      const fd = new FormData();
      fd.set("file", f);
      const res = await fetch("/api/team/import-documents/file", { method: "POST", body: fd }).catch(() => null);
      const j = (await res?.json().catch(() => ({}))) as { title?: string; text?: string; error?: string };
      if (!res?.ok || !j.text) {
        setError(j?.error ?? `Could not read ${f.name}.`);
        continue;
      }
      setSources((s) => [...s, { key: crypto.randomUUID(), title: j.title ?? f.name, text: j.text }]);
    }
    setBusy(null);
  }

  async function startReview() {
    const all = [...sources];
    if (link.trim()) all.push({ key: "link", title: "Google Doc", driveUrl: link.trim() });
    if (paste.trim()) all.push({ key: "paste", title: "Pasted document", text: paste });
    if (!all.length) return setError("Add a file, a Google Doc link or pasted text first.");
    setBusy("Cruxy is sorting your documents case by case. This can take a minute...");
    setError(null);
    try {
      const res = await fetch("/api/team/import-documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "start_review",
          sources: all.map((s) => ({ title: s.title, pastedText: s.text ?? null, driveUrl: s.driveUrl ?? null })),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as Review & { error?: string };
      if (!res.ok) return setError(j.error ?? "Could not read those documents.");
      setReview(j);
    } finally {
      setBusy(null);
    }
  }

  async function assign(splitId: string, caseId: string) {
    if (!review?.batchId) return;
    setBusy("Saving...");
    try {
      const res = await fetch("/api/team/import-documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "assign_split", batchId: review.batchId, splitId, caseId }),
      });
      const j = (await res.json().catch(() => ({}))) as Review & { error?: string };
      if (!res.ok) return setError(j.error ?? "Could not save.");
      setReview({ ...j, batchId: review.batchId });
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    if (!review?.batchId) return;
    setBusy("Cruxy is placing each part into your working documents...");
    setError(null);
    try {
      const res = await fetch("/api/team/import-documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "confirm", batchId: review.batchId, replace }),
      });
      const j = (await res.json().catch(() => ({}))) as { filledCases?: number; error?: string };
      if (!res.ok) return setError(j.error ?? "Could not finish the import.");
      setDone({ filledCases: j.filledCases ?? 0 });
      setReview(null);
      setSources([]);
      setLink("");
      setPaste("");
    } finally {
      setBusy(null);
    }
  }

  const caseName = (id: string | null) => {
    const c = review?.cases.find((x) => x.id === id);
    return c ? `Case ${c.number}: ${c.title}` : null;
  };
  const placed = review?.splits.filter((s) => s.assigned_case_id ?? s.case_id) ?? [];
  const casesCovered = new Set(placed.map((s) => s.assigned_case_id ?? s.case_id));

  return (
    <section className="rounded-[20px] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="font-display m-0 text-xl font-extrabold">Bring your own working documents</h2>
          <p className="m-0 mt-1 text-sm text-[#3B404A]">
            Already have case notes? Upload them, link a Google Doc or paste them. Cruxy sorts them case by case and
            into the six sections, keeping your words. You still get Cruxy&apos;s suggestions, and the best vetted
            ideas from the other teams, on your own document.
          </p>
        </div>
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="min-h-11 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white"
          >
            Import our documents
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="mt-4 flex flex-col gap-3">
          {error ? <p className="m-0 rounded-xl bg-cardinal/5 px-3 py-2 text-sm text-cardinal">{error}</p> : null}
          {busy ? <p className="m-0 text-sm text-muted" aria-live="polite">{busy}</p> : null}

          {done ? (
            <div className="rounded-xl bg-[#EAF6EF] px-4 py-3 text-sm">
              Done. Cruxy filled {done.filledCases} working document{done.filledCases === 1 ? "" : "s"} from your files
              and is reviewing them now. Open a case to see your document and the suggestions on the right.
              <button type="button" className="ml-2 font-semibold underline" onClick={() => setDone(null)}>
                Import more
              </button>
            </div>
          ) : review ? (
            <div className="flex flex-col gap-2">
              <p className="m-0 text-sm font-semibold">
                Cruxy found {casesCovered.size} case{casesCovered.size === 1 ? "" : "s"} in your documents. Check each
                part, fix any that went to the wrong case, then confirm.
              </p>
              <ul className="m-0 list-none space-y-2 p-0">
                {review.splits.map((sp) => {
                  const current = sp.assigned_case_id ?? sp.case_id;
                  return (
                    <li key={sp.id} className="rounded-xl border border-[#E3E5E9] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span
                          className={cn(
                            "text-sm font-semibold",
                            !current && "text-cardinal",
                          )}
                        >
                          {caseName(current) ??
                            (sp.kind === "not_in_regional"
                              ? `${sp.title_guess ?? "A case"} (not in the regional set, skipped)`
                              : "Cruxy could not tell which case this is")}
                        </span>
                        <select
                          aria-label="Which case is this?"
                          value={current ?? ""}
                          disabled={Boolean(busy)}
                          onChange={(e) => e.target.value && void assign(sp.id, e.target.value)}
                          className="h-9 rounded-lg border border-mist bg-[#F7F8FA] px-2 text-sm"
                        >
                          <option value="">{current ? "Move to..." : "Pick the case"}</option>
                          {review.cases.map((c) => (
                            <option key={c.id} value={c.id}>
                              Case {c.number}: {c.title}
                            </option>
                          ))}
                        </select>
                      </div>
                      <p className="m-0 mt-1 line-clamp-3 whitespace-pre-wrap text-[13px] text-muted">
                        {sp.body_text.slice(0, 400)}
                      </p>
                    </li>
                  );
                })}
              </ul>
              <label className="mt-1 flex items-start gap-2 text-sm">
                <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="mt-1" />
                <span>
                  Use only our document. Cruxy&apos;s starting text is cleared where your document has nothing, and
                  shows up as suggestions instead. Untick to keep it in the gaps.
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={Boolean(busy) || casesCovered.size === 0}
                  onClick={() => void confirm()}
                  className="min-h-11 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Confirm and fill {casesCovered.size} case{casesCovered.size === 1 ? "" : "s"}
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => setReview(null)}
                  className="min-h-11 rounded-xl border border-mist px-4 py-2.5 text-sm font-semibold"
                >
                  Start over
                </button>
              </div>
            </div>
          ) : (
            <>
              <label className="block text-xs font-bold uppercase tracking-wide text-muted">
                Files (PDF, Word or text)
                <input
                  type="file"
                  multiple
                  accept=".pdf,.docx,.txt,.md,.html,.htm"
                  disabled={Boolean(busy)}
                  onChange={(e) => {
                    void addFiles(e.target.files);
                    e.target.value = "";
                  }}
                  className="mt-1 block w-full text-sm font-normal normal-case tracking-normal"
                />
              </label>
              {sources.length ? (
                <ul className="m-0 list-none space-y-1 p-0">
                  {sources.map((s) => (
                    <li key={s.key} className="flex items-center justify-between rounded-lg bg-[#F7F8FA] px-3 py-1.5 text-sm">
                      <span>{s.title}</span>
                      <button
                        type="button"
                        className="text-xs underline"
                        onClick={() => setSources((x) => x.filter((y) => y.key !== s.key))}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <label className="block text-xs font-bold uppercase tracking-wide text-muted">
                Google Doc link
                <input
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://docs.google.com/document/d/..."
                  className="mt-1 h-10 w-full rounded-xl border border-mist bg-[#F7F8FA] px-3 text-sm font-normal normal-case tracking-normal"
                />
                <span className="mt-1 block text-[12px] font-normal normal-case tracking-normal text-muted">
                  Crux can read docs in the Ethics Bowl Drive folder. For any other doc, download it and upload the file, or paste it.
                </span>
              </label>
              <label className="block text-xs font-bold uppercase tracking-wide text-muted">
                Or paste
                <textarea
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  rows={5}
                  placeholder="Paste your notes. Headings like Case 3 help, but Cruxy can sort without them."
                  className="mt-1 w-full rounded-xl border border-mist bg-[#F7F8FA] px-3 py-2 text-sm font-normal normal-case tracking-normal"
                />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => void startReview()}
                  className="min-h-11 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Sort them case by case
                </button>
                <button type="button" className="text-sm text-muted underline" onClick={() => setOpen(false)}>
                  Not now
                </button>
              </div>
              <p className="m-0 text-[12px] text-muted">
                Nothing changes until you confirm. Your teammates see the result; other teams never do.{" "}
                <Link href="/team" className="underline">
                  Team settings
                </Link>
              </p>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
