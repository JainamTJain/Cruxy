"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoadingGenie } from "@/components/cruxy/mood/loading-genie";
import { useCruxy } from "@/components/cruxy/cruxy-context";

type Passage = { ord: number; anchor: string | null; text: string };
type Digest = {
  summary: string;
  key_points: { point: string; quote: string | null }[];
  ideas: { use: string; text: string }[];
  questions: string[];
  relevance: string;
};
type Reading = {
  kind: "web" | "import";
  id: string;
  caseId: string;
  title: string;
  sourceUrl: string | null;
  byline: string | null;
  why: string | null;
  passages: Passage[];
  digest: Digest | null;
  textStatus: "none" | "done" | "failed";
  textError: string | null;
};
type Annotation = {
  id: string;
  kind: "highlight" | "comment" | "note";
  quote: string | null;
  body: string | null;
  passage_ord: number | null;
  person_id: string | null;
  person_name: string | null;
  created_at: string;
};

type Sel = { text: string; ord: number | null; x: number; y: number };

const USE_LABEL: Record<string, string> = {
  support: "Support",
  objection: "Objection",
  reply: "Reply",
  stakeholder: "Stakeholder",
  framework: "Framework",
  example: "Example",
  fact: "Fact",
};

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Wrap highlighted and commented quotes inside a paragraph. */
function Marked({ text, marks }: { text: string; marks: Annotation[] }) {
  const usable = marks.filter((m) => m.quote && m.quote.length >= 3 && text.includes(m.quote));
  if (!usable.length) return <>{text}</>;
  const re = new RegExp(`(${usable.map((m) => escapeRe(m.quote!)).join("|")})`, "g");
  return (
    <>
      {text.split(re).map((part, i) => {
        const m = usable.find((u) => u.quote === part);
        if (!m) return <span key={i}>{part}</span>;
        return m.kind === "comment" ? (
          <mark
            key={i}
            title={m.body ?? undefined}
            className="rounded-sm bg-transparent underline decoration-[#2F6FED] decoration-2 underline-offset-2"
          >
            {part}
          </mark>
        ) : (
          <mark key={i} className="rounded-sm bg-[#FFE58A] px-0.5">
            {part}
          </mark>
        );
      })}
    </>
  );
}

export function ReadingRoom({ caseId, kind, id }: { caseId: string; kind: "web" | "import"; id: string }) {
  const [reading, setReading] = useState<Reading | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<Sel | null>(null);
  const [commentDraft, setCommentDraft] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [showDigest, setShowDigest] = useState(true);
  const articleRef = useRef<HTMLDivElement>(null);
  const { wake, setBubble, setHighlight } = useCruxy();

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch(
      `/api/case/reading?caseId=${encodeURIComponent(caseId)}&kind=${kind}&id=${encodeURIComponent(id)}`,
    ).catch(() => null);
    if (!res) {
      setError("Could not reach Crux. Check your connection and try again.");
      return;
    }
    const json = (await res.json().catch(() => ({}))) as { reading?: Reading; annotations?: Annotation[]; error?: string };
    if (!res.ok || !json.reading) {
      setError(json.error ?? "Could not open this reading.");
      return;
    }
    setReading(json.reading);
    setAnnotations(json.annotations ?? []);
  }, [caseId, kind, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (payload: Record<string, unknown>) => {
      setBusy(true);
      try {
        const res = await fetch("/api/case/reading", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ caseId, kind, id, ...payload }),
        });
        const json = (await res.json().catch(() => ({}))) as { annotations?: Annotation[]; error?: string };
        if (!res.ok) {
          setError(json.error ?? "Could not save.");
          return false;
        }
        setAnnotations(json.annotations ?? []);
        setError(null);
        return true;
      } finally {
        setBusy(false);
      }
    },
    [caseId, kind, id],
  );

  // Selecting text opens a small toolbar: Highlight, Comment, Ask Cruxy.
  useEffect(() => {
    const onUp = () => {
      const s = window.getSelection();
      const text = s?.toString().replace(/\s+/g, " ").trim() ?? "";
      if (!s || text.length < 3 || !articleRef.current || !s.anchorNode || !articleRef.current.contains(s.anchorNode)) {
        return;
      }
      const el = (s.anchorNode.nodeType === 1 ? (s.anchorNode as Element) : s.anchorNode.parentElement)?.closest("[data-ord]");
      const ord = el ? Number(el.getAttribute("data-ord")) : null;
      const rect = s.getRangeAt(0).getBoundingClientRect();
      setSel({
        text: text.slice(0, 1200),
        ord: Number.isFinite(ord) ? ord : null,
        x: Math.min(Math.max(12, rect.left), window.innerWidth - 340),
        y: Math.max(12, rect.top - 52),
      });
      setCommentDraft(null);
    };
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchend", onUp);
    return () => {
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchend", onUp);
    };
  }, []);

  const marksByOrd = useMemo(() => {
    const m = new Map<number, Annotation[]>();
    for (const a of annotations) {
      if (a.kind === "note" || a.passage_ord == null) continue;
      m.set(a.passage_ord, [...(m.get(a.passage_ord) ?? []), a]);
    }
    return m;
  }, [annotations]);

  if (error && !reading) {
    return (
      <main className="mx-auto max-w-3xl">
        <Link href={`/case-brain/${caseId}?tab=reading`} className="text-sm font-semibold text-muted hover:text-ink">
          ← Back to the case
        </Link>
        <p className="mt-4 rounded-xl bg-white p-4 text-sm text-cardinal">{error}</p>
        <button type="button" onClick={() => void load()} className="mt-2 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white">
          Try again
        </button>
      </main>
    );
  }
  if (!reading) return <LoadingGenie label="Opening the reading. The first time can take a few seconds..." />;

  const notes = annotations.filter((a) => a.kind === "note");
  const marks = annotations.filter((a) => a.kind !== "note");

  return (
    <main className="mx-auto max-w-6xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Link href={`/case-brain/${caseId}?tab=reading`} className="text-sm font-semibold text-muted hover:text-ink">
          ← Back to the case
        </Link>
        {reading.sourceUrl ? (
          <a href={reading.sourceUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-cardinal underline">
            Open the original
          </a>
        ) : null}
      </div>

      <header className="rounded-[20px] bg-white p-5">
        <p className="m-0 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
          {reading.kind === "web" ? "Deeper reading" : "Your team's reading"}
        </p>
        <h1 className="font-display m-0 mt-1 text-2xl font-extrabold leading-tight sm:text-3xl">{reading.title}</h1>
        {reading.byline ? <p className="m-0 mt-1 text-sm text-muted">{reading.byline}</p> : null}
        {reading.why ? <p className="m-0 mt-2 text-sm text-[#3B404A]">{reading.why}</p> : null}
      </header>

      {error ? <p className="mt-3 rounded-xl bg-cardinal/5 px-3 py-2 text-sm text-cardinal">{error}</p> : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
        <div className="flex min-w-0 flex-col gap-4">
          {reading.digest ? (
            <section className="rounded-[20px] border border-[#E3E5E9] bg-white p-4">
              <button
                type="button"
                className="flex w-full items-center justify-between text-left"
                onClick={() => setShowDigest((v) => !v)}
                aria-expanded={showDigest}
              >
                <span className="font-display text-lg font-extrabold">Cruxy&apos;s digest</span>
                <span className="text-xs font-semibold text-muted">{showDigest ? "Hide" : "Show"}</span>
              </button>
              {showDigest ? (
                <div className="mt-2 flex flex-col gap-3 text-sm leading-relaxed">
                  <p className="m-0">{reading.digest.summary}</p>
                  {reading.digest.relevance ? (
                    <p className="m-0 text-[#3B404A]">
                      <span className="font-semibold">For this case: </span>
                      {reading.digest.relevance}
                    </p>
                  ) : null}
                  {reading.digest.key_points.length ? (
                    <ul className="m-0 list-disc space-y-1 pl-5">
                      {reading.digest.key_points.map((k) => (
                        <li key={k.point}>
                          {k.point}
                          {k.quote ? <span className="text-muted"> &ldquo;{k.quote}&rdquo;</span> : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {reading.digest.ideas.length ? (
                    <div>
                      <p className="m-0 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Ideas you could use</p>
                      <ul className="m-0 mt-1 list-none space-y-1 p-0">
                        {reading.digest.ideas.map((i) => (
                          <li key={i.text}>
                            <span className="font-semibold">{USE_LABEL[i.use] ?? "Idea"}: </span>
                            {i.text}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {reading.digest.questions.length ? (
                    <div>
                      <p className="m-0 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">A judge might ask</p>
                      <ul className="m-0 mt-1 list-disc space-y-1 pl-5">
                        {reading.digest.questions.map((q) => (
                          <li key={q}>{q}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          <article ref={articleRef} className="rounded-[20px] bg-white p-5 sm:p-7">
            {reading.passages.length === 0 ? (
              <div className="text-sm text-muted">
                <p className="m-0">
                  {reading.textError ?? "Cruxy could not bring this page's text into Crux."} You can still keep notes
                  here while you read the original.
                </p>
                {reading.sourceUrl ? (
                  <a href={reading.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block font-semibold text-cardinal underline">
                    Open the original
                  </a>
                ) : null}
              </div>
            ) : (
              reading.passages.map((p) => (
                <section key={p.ord} id={`part-${p.ord}`} data-ord={p.ord} className="scroll-mt-20">
                  {p.text.split(/\n{2,}/).map((para, i) => (
                    <p key={i} className="m-0 mb-4 text-[16px] leading-[1.75] text-ink">
                      <Marked text={para} marks={marksByOrd.get(p.ord) ?? []} />
                    </p>
                  ))}
                </section>
              ))
            )}
          </article>
        </div>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
          <section className="rounded-[20px] bg-[#FFF8DC] p-4">
            <h2 className="font-display m-0 text-lg font-extrabold">Sticky notes</h2>
            <p className="m-0 mt-1 text-[13px] text-[#5B5240]">
              Only your team sees these. Cruxy reads your notes and comments when it reviews your working document.
            </p>
            <textarea
              rows={3}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="A thought, a counterpoint, where this fits in our case..."
              className="mt-2 w-full rounded-xl border border-[#E8DDB5] bg-white px-3 py-2 text-sm"
              disabled={busy}
            />
            <button
              type="button"
              disabled={busy || !noteDraft.trim()}
              className="mt-2 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() =>
                void save({ action: "add", annotationKind: "note", body: noteDraft.trim() }).then((ok) => ok && setNoteDraft(""))
              }
            >
              Add note
            </button>
            <ul className="m-0 mt-3 list-none space-y-2 p-0">
              {notes.map((n) => (
                <li key={n.id} className="rounded-xl bg-white px-3 py-2 text-sm shadow-[0_1px_0_rgba(0,0,0,0.04)]">
                  <p className="m-0 whitespace-pre-wrap">{n.body}</p>
                  <p className="m-0 mt-1 flex items-center justify-between text-[11px] text-muted">
                    <span>{n.person_name ?? "Teammate"}</span>
                    <button
                      type="button"
                      className="underline"
                      disabled={busy}
                      onClick={() => void save({ action: "delete", annotationId: n.id })}
                    >
                      Remove
                    </button>
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-[20px] bg-white p-4">
            <h2 className="font-display m-0 text-lg font-extrabold">Highlights and comments</h2>
            <p className="m-0 mt-1 text-[13px] text-muted">Select any text in the reading to highlight it, comment on it or ask Cruxy.</p>
            {marks.length === 0 ? (
              <p className="m-0 mt-2 text-sm text-muted">None yet.</p>
            ) : (
              <ul className="m-0 mt-2 list-none space-y-2 p-0">
                {marks.map((m) => (
                  <li key={m.id} className="rounded-xl bg-[#F7F8FA] px-3 py-2 text-sm">
                    <a href={m.passage_ord != null ? `#part-${m.passage_ord}` : undefined} className="block">
                      <span className={m.kind === "comment" ? "underline decoration-[#2F6FED] decoration-2" : "bg-[#FFE58A]"}>
                        &ldquo;{(m.quote ?? "").slice(0, 180)}
                        {(m.quote ?? "").length > 180 ? "..." : ""}&rdquo;
                      </span>
                    </a>
                    {m.body ? <p className="m-0 mt-1">{m.body}</p> : null}
                    <p className="m-0 mt-1 flex items-center justify-between text-[11px] text-muted">
                      <span>{m.person_name ?? "Teammate"}</span>
                      <button
                        type="button"
                        className="underline"
                        disabled={busy}
                        onClick={() => void save({ action: "delete", annotationId: m.id })}
                      >
                        Remove
                      </button>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Link
            href={`/case-brain/${caseId}?tab=working`}
            className="rounded-xl border border-mist bg-white px-4 py-2.5 text-center text-sm font-semibold"
          >
            Go to the working document
          </Link>
        </aside>
      </div>

      {sel ? (
        <div
          role="dialog"
          aria-label="Selected text"
          className="fixed z-[60] max-w-[calc(100vw-24px)] rounded-xl border border-ink/10 bg-white p-2 shadow-[0_12px_28px_rgba(17,19,24,0.16)]"
          style={{ left: sel.x, top: sel.y }}
          onMouseUp={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          {commentDraft === null ? (
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                className="rounded-lg bg-[#FFE58A] px-2.5 py-1.5 text-xs font-semibold"
                disabled={busy}
                onClick={() =>
                  void save({ action: "add", annotationKind: "highlight", quote: sel.text, passageOrd: sel.ord }).then(() => {
                    setSel(null);
                    window.getSelection()?.removeAllRanges();
                  })
                }
              >
                Highlight
              </button>
              <button type="button" className="rounded-lg bg-[#E8F0FE] px-2.5 py-1.5 text-xs font-semibold" onClick={() => setCommentDraft("")}>
                Comment
              </button>
              <button
                type="button"
                className="rounded-lg bg-ink px-2.5 py-1.5 text-xs font-semibold text-white"
                onClick={() => {
                  setHighlight(sel.text);
                  wake();
                  setBubble(
                    `From "${reading.title.slice(0, 60)}": "${sel.text.slice(0, 120)}${sel.text.length > 120 ? "..." : ""}". What do you want to figure out?`,
                  );
                  setSel(null);
                }}
              >
                Ask Cruxy
              </button>
              <button type="button" className="ml-auto px-2 text-xs text-muted" onClick={() => setSel(null)}>
                Close
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <textarea
                autoFocus
                rows={3}
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                placeholder="Your comment"
                className="w-[min(300px,calc(100vw-48px))] rounded-lg border border-mist px-2 py-1.5 text-sm"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy || !commentDraft.trim()}
                  className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                  onClick={() =>
                    void save({
                      action: "add",
                      annotationKind: "comment",
                      quote: sel.text,
                      body: commentDraft.trim(),
                      passageOrd: sel.ord,
                    }).then((ok) => {
                      if (ok) {
                        setSel(null);
                        setCommentDraft(null);
                        window.getSelection()?.removeAllRanges();
                      }
                    })
                  }
                >
                  Save comment
                </button>
                <button type="button" className="text-xs text-muted" onClick={() => setCommentDraft(null)}>
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </main>
  );
}
