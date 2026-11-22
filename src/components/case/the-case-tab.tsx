"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LoadingGenie } from "@/components/cruxy/mood/loading-genie";
import type { CaseHomePayload } from "@/lib/case-home/types";
import { cn } from "@/lib/utils";

type Props = {
  caseId: string;
  teamId: string;
  /** Prefetched payload avoids a second round trip when the parent already has it. */
  initial?: CaseHomePayload | null;
  className?: string;
};

function markText(
  text: string,
  marks: { needle: string; kind: "highlight" | "comment" }[],
) {
  const hits: { from: number; to: number; kind: "highlight" | "comment" }[] =
    [];
  for (const m of marks) {
    const needle = m.needle.trim();
    if (needle.length < 6) continue;
    const idx = text.indexOf(needle);
    if (idx >= 0) hits.push({ from: idx, to: idx + needle.length, kind: m.kind });
  }
  hits.sort((a, b) => a.from - b.from);
  if (hits.length === 0) return text;

  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  for (const h of hits) {
    if (h.from < cursor) continue;
    if (h.from > cursor) nodes.push(text.slice(cursor, h.from));
    const slice = text.slice(h.from, h.to);
    nodes.push(
      h.kind === "highlight" ? (
        <mark key={key++} className="rounded-[3px] bg-[#FFE58A] px-0.5">
          {slice}
        </mark>
      ) : (
        <span
          key={key++}
          className="border-b-2 border-[#0F7B6C] bg-[#D8EEEB]"
        >
          {slice}
        </span>
      ),
    );
    cursor = h.to;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

/**
 * The case: full case text (or seed facts) with highlights, questions and notes
 * kept in place. Own file so Workstream C can ship Team Brief beside it.
 */
export function TheCaseTab({ caseId, teamId, initial = null, className }: Props) {
  const [data, setData] = useState<CaseHomePayload | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initial);

  const load = useCallback(async (force = false) => {
    if (initial && !force) {
      setData(initial);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const q = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
    const res = await fetch(`/api/case-home/${caseId}${q}`);
    const json = (await res.json()) as CaseHomePayload & { error?: string };
    if (!res.ok) {
      setError(json.error ?? "Could not load the case.");
      setLoading(false);
      return;
    }
    setData(json);
    setLoading(false);
  }, [caseId, teamId, initial]);

  useEffect(() => {
    void load();
  }, [load]);

  // Select words in the case to highlight, ask, or note them.
  const articleRef = useRef<HTMLDivElement | null>(null);
  const [sel, setSel] = useState<{
    text: string;
    passageId: string;
    top: number;
  } | null>(null);
  const [mode, setMode] = useState<"question" | "note" | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [showSources, setShowSources] = useState(false);
  const [showAllNotes, setShowAllNotes] = useState(false);

  function captureSelection() {
    const s = window.getSelection();
    const text = s?.toString().replace(/\s+/g, " ").trim() ?? "";
    if (!s || text.length < 3 || !articleRef.current) {
      if (!mode) setSel(null);
      return;
    }
    const node = s.anchorNode instanceof Element ? s.anchorNode : s.anchorNode?.parentElement;
    const para = node?.closest("[data-passage-id]") as HTMLElement | null;
    const passageId = para?.dataset.passageId;
    if (!passageId) return;
    const rect = s.getRangeAt(0).getBoundingClientRect();
    const box = articleRef.current.getBoundingClientRect();
    setSel({ text: text.slice(0, 400), passageId, top: rect.bottom - box.top + 8 });
    setMode(null);
    setDraft("");
    setStatus(null);
  }

  async function save(kind: "highlight" | "question" | "note") {
    if (!sel || busy) return;
    if (kind !== "highlight" && !draft.trim()) return;
    setBusy(true);
    const res =
      kind === "highlight"
        ? await fetch("/api/library/highlights", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ passageId: sel.passageId, range: sel.text }),
          })
        : await fetch("/api/library/comments", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              passageId: sel.passageId,
              range: sel.text,
              body: kind === "question" ? `Question: ${draft.trim()}` : draft.trim(),
            }),
          });
    setBusy(false);
    if (!res.ok) {
      setStatus("That did not save. Try again in a moment.");
      return;
    }
    setStatus(
      kind === "highlight"
        ? "Highlighted. Your team sees it here."
        : kind === "question"
          ? "Question added. Your team sees it below the case."
          : "Note added. Your team sees it below the case.",
    );
    setSel(null);
    setMode(null);
    setDraft("");
    window.getSelection()?.removeAllRanges();
    await load(true);
  }

  const marks = useMemo(() => {
    if (!data) return [];
    return data.annotations
      .filter((a) => a.kind === "highlight" || a.kind === "comment")
      .map((a) => ({
        needle: a.range && a.range !== "selection" ? a.range : a.body,
        kind: a.kind as "highlight" | "comment",
      }));
  }, [data]);

  if (loading) {
    return (
      <div className={cn("min-h-[280px]", className)}>
        <LoadingGenie label="Opening the case…" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className={cn("text-sm text-cardinal", className)}>
        {error ?? "Nothing here yet."}
      </p>
    );
  }

  const isQuestion = (a: { kind: string; body: string }) =>
    a.kind === "question" || (a.kind === "comment" && a.body.startsWith("Question: "));
  const questions = data.annotations.filter(isQuestion);
  const notes = data.annotations.filter((a) => a.kind === "comment" && !isQuestion(a));
  const sources = data.sources ?? [];

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
            The case
          </p>
          <h2 className="font-display m-0 text-2xl font-extrabold tracking-[-0.02em]">
            Case {data.case.number}: {data.case.title}
          </h2>
        </div>
        <span className="text-xs text-muted">
          {data.source === "case_set"
            ? "From the case set"
            : "From team prep notes"}
        </span>
      </div>

      <p className="m-0 text-sm text-muted">
        Select any words to highlight them, ask a question or leave a note. Your
        team sees them here.
      </p>
      {status ? (
        <p className="m-0 text-sm font-semibold text-[#1F7A4D]" role="status">
          {status}
        </p>
      ) : null}

      <article className="relative rounded-[20px] bg-white p-5 sm:p-7">
        <div
          ref={articleRef}
          onMouseUp={captureSelection}
          onTouchEnd={() => window.setTimeout(captureSelection, 50)}
          className="relative mx-auto flex max-w-[680px] flex-col gap-4 text-[17px] leading-[1.65] text-[#1C1F26] sm:text-[19px] sm:leading-[1.7]"
          style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
        >
          {data.paragraphs.map((p) => (
            <p
              key={p.id}
              className="m-0"
              data-passage-id={p.passage_id ?? (data.source === "case_set" ? p.id : undefined)}
            >
              {markText(p.text, marks)}
            </p>
          ))}

          {sel ? (
            <div
              className="absolute left-0 right-0 z-20 mx-auto w-full max-w-[520px] rounded-2xl border border-ink/10 bg-white p-3 font-sans text-sm shadow-[0_10px_30px_rgba(17,19,24,0.14)]"
              style={{ top: sel.top }}
              onMouseUp={(e) => e.stopPropagation()}
            >
              <p className="m-0 line-clamp-2 text-[12px] text-muted">
                “{sel.text}”
              </p>
              {mode ? (
                <form
                  className="mt-2 flex flex-col gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save(mode);
                  }}
                >
                  <label className="sr-only" htmlFor="case-annot">
                    {mode === "question" ? "Your question" : "Your note"}
                  </label>
                  <textarea
                    id="case-annot"
                    autoFocus
                    rows={2}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={
                      mode === "question"
                        ? "What do you want the team to think about?"
                        : "What should the team remember here?"
                    }
                    className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={busy || !draft.trim()}
                      className="rounded-lg bg-cardinal px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {busy ? "Saving..." : mode === "question" ? "Add question" : "Add note"}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg px-3 py-1.5 text-sm text-muted underline"
                      onClick={() => setMode(null)}
                    >
                      Back
                    </button>
                  </div>
                </form>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void save("highlight")}
                    className="rounded-lg bg-[#FFF1B8] px-3 py-1.5 font-semibold text-ink"
                  >
                    Highlight
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("question")}
                    className="rounded-lg border border-ink/15 px-3 py-1.5 font-semibold text-ink"
                  >
                    Ask a question
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("note")}
                    className="rounded-lg border border-ink/15 px-3 py-1.5 font-semibold text-ink"
                  >
                    Add a note
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSel(null);
                      window.getSelection()?.removeAllRanges();
                    }}
                    className="ml-auto rounded-lg px-2 py-1.5 text-muted underline"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {sources.length ? (
          <div className="mx-auto mt-6 max-w-[680px] border-t border-mist pt-3 font-sans">
            <button
              type="button"
              className="text-sm font-semibold text-ink underline"
              aria-expanded={showSources}
              onClick={() => setShowSources((v) => !v)}
            >
              {showSources ? "Hide sources" : `Sources (${sources.length})`}
            </button>
            {showSources ? (
              <ol className="mt-2 m-0 list-none space-y-2 p-0 text-[13px] leading-snug text-muted">
                {sources.map((src) => (
                  <li key={src.n} className="break-words">
                    <span className="font-semibold text-ink">[{src.n}]</span> {src.text}
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        ) : null}
      </article>

      {data.stakeholders.length > 0 ? (
        <section className="rounded-[20px] bg-white p-4 sm:p-5">
          <h3 className="font-display m-0 text-lg font-extrabold">
            Who is at stake
          </h3>
          <ul className="mt-3 m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
            {data.stakeholders.map((s) => (
              <li
                key={s.id}
                className="rounded-xl bg-[#F7F8FA] px-3 py-2.5 text-sm"
              >
                <p className="m-0 font-semibold text-ink">{s.who}</p>
                <p className="m-0 mt-0.5 text-muted">{s.stake}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {questions.length > 0 ? (
        <section className="rounded-[20px] bg-white p-4 sm:p-5">
          <h3 className="font-display m-0 text-lg font-extrabold">
            Questions on this case
          </h3>
          <ul className="mt-3 m-0 list-none space-y-2 p-0">
            {questions.map((q) => (
              <li
                key={q.id}
                className="rounded-xl border border-[#E3E5E9] px-3 py-2.5 text-sm"
              >
                <span className="font-semibold">{q.person_name ?? "Someone"}</span>
                {q.range && q.range !== "selection" ? (
                  <span className="text-muted"> on “{q.range.slice(0, 60)}”</span>
                ) : null}
                <p className="m-0 mt-1">{q.body.replace(/^Question: /, "")}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {notes.length > 0 ? (
        <section className="rounded-[20px] bg-white p-4 sm:p-5">
          <h3 className="font-display m-0 text-lg font-extrabold">
            Notes in place
          </h3>
          <ul className="mt-3 m-0 list-none space-y-2 p-0">
            {(showAllNotes ? notes : notes.slice(0, 8)).map((n) => (
              <li key={n.id} className="rounded-xl bg-[#F7F8FA] px-3 py-2.5 text-sm">
                <span className="font-semibold">
                  {n.person_name ?? "Someone"}
                </span>
                {n.range ? (
                  <span className="text-muted"> on “{n.range.slice(0, 40)}”</span>
                ) : null}
                <p className="m-0 mt-1">{n.body}</p>
              </li>
            ))}
          </ul>
          {notes.length > 8 ? (
            <button
              type="button"
              className="mt-2 text-sm text-muted underline"
              onClick={() => setShowAllNotes((v) => !v)}
            >
              {showAllNotes ? "Show fewer" : `Show all ${notes.length} notes`}
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
