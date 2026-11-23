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
  bookmarks?: { ord: number; why: string }[];
};
type Reading = {
  kind: "web" | "import" | "case";
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
  cruxy?: { status: "thinking" | "drafted" | "kept" | "failed"; reason: string | null; suggestion_id: string | null } | null;
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

function partLabel(passages: Passage[], ord: number | null): string | null {
  if (ord == null) return null;
  const p = passages.find((x) => x.ord === ord);
  if (p?.anchor) return p.anchor;
  return `Part ${ord + 1}`;
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

/** What Cruxy made of a note or comment: drafted, kept as a note (with why), or still weighing it. */
function CruxyNoteStatus({
  a,
  caseId,
  busy,
  save,
}: {
  a: Annotation;
  caseId: string;
  busy: boolean;
  save: (payload: Record<string, unknown>) => Promise<boolean>;
}) {
  if (a.kind === "highlight") return null;
  const stale = Date.now() - new Date(a.created_at).getTime() > 10 * 60_000;
  const st =
    (!a.cruxy || a.cruxy.status === "thinking") && stale
      ? { status: "failed" as const, reason: "Cruxy did not get to this one.", suggestion_id: null }
      : a.cruxy;
  if (!st || st.status === "thinking") {
    return (
      <p className="m-0 mt-1.5 flex items-center gap-1.5 text-[12px] text-[#5B5240]" aria-live="polite">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#C9A227]" />
        Cruxy is weighing this for your case
      </p>
    );
  }
  if (st.status === "drafted") {
    return (
      <p className="m-0 mt-1.5 rounded-lg bg-[#EAF6EF] px-2 py-1 text-[12px] text-[#1F5F3B]">
        Cruxy developed this into a suggestion. {st.reason ?? ""}{" "}
        <Link href={`/case-brain/${caseId}?tab=working`} className="font-semibold underline">
          See it
        </Link>
      </p>
    );
  }
  return (
    <div className="mt-1.5 rounded-lg bg-[#F4F5F7] px-2 py-1 text-[12px] text-[#5B6170]">
      <span>
        {st.status === "kept" ? "Kept as a note. " : ""}
        {st.reason ?? (st.status === "failed" ? "Cruxy could not finish this one." : "")}
      </span>{" "}
      <button
        type="button"
        disabled={busy}
        className="font-semibold text-cardinal underline disabled:opacity-60"
        onClick={() => void save({ action: "consider", annotationId: a.id })}
      >
        {st.status === "failed" ? "Try again" : "Draft it anyway"}
      </button>
    </div>
  );
}

function NotesPanel({
  caseId,
  notes,
  marks,
  passages,
  noteDraft,
  setNoteDraft,
  busy,
  save,
  onClose,
}: {
  caseId: string;
  notes: Annotation[];
  marks: Annotation[];
  passages: Passage[];
  noteDraft: string;
  setNoteDraft: (v: string) => void;
  busy: boolean;
  save: (payload: Record<string, unknown>) => Promise<boolean>;
  onClose?: () => void;
}) {
  return (
    <>
      <section className="rounded-[20px] bg-[#FFF8DC] p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-display m-0 text-lg font-extrabold">Sticky notes</h2>
          {onClose ? (
            <button type="button" className="text-xs font-semibold text-muted underline" onClick={onClose}>
              Close
            </button>
          ) : null}
        </div>
        <p className="m-0 mt-1 text-[13px] text-[#5B5240]">
          Only your team sees these. Rough thoughts are welcome: when a note or comment carries ethical weight for the
          case, Cruxy researches it and drafts a suggestion for your working document.
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
          className="mt-2 min-h-11 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
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
              <CruxyNoteStatus a={n} caseId={caseId} busy={busy} save={save} />
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
        <p className="m-0 mt-1 text-[13px] text-muted">
          Select any text in the reading to highlight it, comment on it or ask Cruxy.
        </p>
        {marks.length === 0 ? (
          <p className="m-0 mt-2 text-sm text-muted">None yet.</p>
        ) : (
          <ul className="m-0 mt-2 list-none space-y-2 p-0">
            {marks.map((m) => {
              const part = partLabel(passages, m.passage_ord);
              return (
                <li key={m.id} className="rounded-xl bg-[#F7F8FA] px-3 py-2 text-sm">
                  {part && m.passage_ord != null ? (
                    <a
                      href={`#part-${m.passage_ord}`}
                      className="mb-1 inline-block text-[11px] font-bold uppercase tracking-[0.08em] text-muted underline"
                      onClick={onClose}
                    >
                      {part}
                    </a>
                  ) : null}
                  <a href={m.passage_ord != null ? `#part-${m.passage_ord}` : undefined} className="block" onClick={onClose}>
                    <span className={m.kind === "comment" ? "underline decoration-[#2F6FED] decoration-2" : "bg-[#FFE58A]"}>
                      &ldquo;{(m.quote ?? "").slice(0, 180)}
                      {(m.quote ?? "").length > 180 ? "..." : ""}&rdquo;
                    </span>
                  </a>
                  {m.body ? <p className="m-0 mt-1">{m.body}</p> : null}
                  <CruxyNoteStatus a={m} caseId={caseId} busy={busy} save={save} />
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
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

export function ReadingRoom({ caseId, kind, id }: { caseId: string; kind: "web" | "import" | "case"; id: string }) {
  const [reading, setReading] = useState<Reading | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<Sel | null>(null);
  const [commentDraft, setCommentDraft] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [showDigest, setShowDigest] = useState(true);
  const [notesOpen, setNotesOpen] = useState(false);
  const articleRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
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

  // While Cruxy is weighing a note, check back every few seconds.
  const weighing = annotations.some(
    (a) =>
      a.kind !== "highlight" &&
      (a.cruxy?.status === "thinking" ||
        !a.cruxy) &&
      Date.now() - new Date(a.created_at).getTime() < 10 * 60_000,
  );
  useEffect(() => {
    if (!weighing) return;
    const t = setInterval(() => void load(), 6000);
    return () => clearInterval(t);
  }, [weighing, load]);

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

  // Selecting text opens a small toolbar. Desktop: mouseup. Phones: long-press
  // selection fires selectionchange (mouseup/touchend often miss iOS).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const readSelection = () => {
      const s = window.getSelection();
      const text = s?.toString().replace(/\s+/g, " ").trim() ?? "";
      if (!s || text.length < 3 || !articleRef.current || !s.anchorNode || !articleRef.current.contains(s.anchorNode)) {
        return;
      }
      if (s.rangeCount < 1) return;
      const el = (s.anchorNode.nodeType === 1 ? (s.anchorNode as Element) : s.anchorNode.parentElement)?.closest(
        "[data-ord]",
      );
      const ord = el ? Number(el.getAttribute("data-ord")) : null;
      const rect = s.getRangeAt(0).getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      setSel({
        text: text.slice(0, 1200),
        ord: Number.isFinite(ord) ? ord : null,
        x: Math.min(Math.max(12, rect.left), window.innerWidth - 340),
        y: Math.max(12, rect.top - 52),
      });
      setCommentDraft(null);
    };

    const onUp = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(readSelection, 30);
    };

    const onSelectionChange = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(readSelection, 280);
    };

    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (toolbarRef.current && t && toolbarRef.current.contains(t)) return;
      // Clear only when tapping outside the toolbar and not extending a selection.
      if (!window.getSelection()?.toString().trim()) setSel(null);
    };

    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchend", onUp);
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchend", onUp);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  // Lock body scroll while the phone notes sheet is open.
  useEffect(() => {
    if (!notesOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [notesOpen]);

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
  const noteCount = notes.length + marks.length;
  // A jump list only helps when the reading has real section names.
  const showJump =
    reading.passages.length > 2 &&
    reading.passages.filter((p) => p.anchor && !/^(Part \d+|Opening)$/.test(p.anchor) && !p.anchor.endsWith("(cont.)")).length >= 2;

  return (
    <main className="mx-auto max-w-6xl pb-24 lg:pb-0">
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
          {reading.kind === "case" ? "The case" : reading.kind === "web" ? "Deeper reading" : "Your team's reading"}
        </p>
        <h1 className="font-display m-0 mt-1 text-2xl font-extrabold leading-tight sm:text-3xl">{reading.title}</h1>
        {reading.byline ? <p className="m-0 mt-1 text-sm text-muted">{reading.byline}</p> : null}
        {reading.why ? <p className="m-0 mt-2 text-sm text-[#3B404A]">{reading.why.replace(/\*+/g, "")}</p> : null}
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
            {reading.digest?.bookmarks?.length ? (
              <nav aria-label="Bookmarked for this case" className="mb-5 rounded-xl bg-[#FFF8DC] p-3">
                <p className="m-0 text-[11px] font-bold uppercase tracking-[0.08em] text-[#8A5200]">
                  Bookmarked for this case
                </p>
                <ol className="m-0 mt-2 list-none space-y-1.5 p-0">
                  {reading.digest.bookmarks.map((b) => (
                    <li key={b.ord}>
                      <a href={`#part-${b.ord}`} className="block rounded-lg px-2 py-1 hover:bg-white/70">
                        <span className="text-sm font-semibold text-ink">
                          {partLabel(reading.passages, b.ord) ?? `Part ${b.ord + 1}`}
                        </span>
                        {b.why ? <span className="block text-[13px] leading-snug text-[#5B5240]">{b.why}</span> : null}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            ) : null}
            {showJump ? (
              <nav aria-label="Jump to passage" className="mb-5 border-b border-[#E3E5E9] pb-4">
                <p className="m-0 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Jump to</p>
                <ol className="m-0 mt-2 list-none space-y-0.5 p-0">
                  {reading.passages
                    .filter((p) => !(p.anchor ?? "").endsWith("(cont.)"))
                    .map((p) => (
                      <li key={p.ord}>
                        <a
                          href={`#part-${p.ord}`}
                          className="flex min-h-9 items-center rounded-lg px-2 text-sm font-medium text-ink hover:bg-[#F4F5F7]"
                        >
                          <span className="truncate">{p.anchor ?? `Part ${p.ord + 1}`}</span>
                        </a>
                      </li>
                    ))}
                </ol>
              </nav>
            ) : null}
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
                <section
                  key={p.ord}
                  id={`part-${p.ord}`}
                  data-ord={p.ord}
                  className={
                    reading.digest?.bookmarks?.some((b) => b.ord === p.ord)
                      ? "scroll-mt-20 -ml-3 border-l-[3px] border-[#E0B84C] pl-3"
                      : "scroll-mt-20"
                  }
                >
                  {reading.digest?.bookmarks?.some((b) => b.ord === p.ord) ? (
                    <p className="m-0 mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#8A5200]">
                      Bookmarked: {reading.digest.bookmarks.find((b) => b.ord === p.ord)?.why}
                    </p>
                  ) : null}
                  {p.text.split(/\n{2,}/).map((para, i) =>
                    para.startsWith("## ") ? (
                      <h2 key={i} className="font-display m-0 mb-3 mt-6 text-xl font-extrabold leading-snug text-ink first:mt-0">
                        {para.slice(3)}
                      </h2>
                    ) : para.startsWith("- ") ? (
                      <p key={i} className="relative m-0 mb-2 pl-5 text-[16px] leading-[1.7] text-ink">
                        <span aria-hidden className="absolute left-1 top-0 text-muted">
                          •
                        </span>
                        <Marked text={para.slice(2)} marks={marksByOrd.get(p.ord) ?? []} />
                      </p>
                    ) : (
                      <p key={i} className="m-0 mb-4 text-[16px] leading-[1.75] text-ink">
                        <Marked text={para} marks={marksByOrd.get(p.ord) ?? []} />
                      </p>
                    ),
                  )}
                </section>
              ))
            )}
          </article>
        </div>

        {/* Desktop: sticky aside unchanged. Phone: hidden here, bottom sheet below. */}
        <aside className="hidden flex-col gap-3 lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
          <NotesPanel
            caseId={caseId}
            notes={notes}
            marks={marks}
            passages={reading.passages}
            noteDraft={noteDraft}
            setNoteDraft={setNoteDraft}
            busy={busy}
            save={save}
          />
          <Link
            href={`/case-brain/${caseId}?tab=working`}
            className="rounded-xl border border-mist bg-white px-4 py-2.5 text-center text-sm font-semibold"
          >
            Go to the working document
          </Link>
        </aside>
      </div>

      {/* Phone: floating Notes button + bottom sheet */}
      <button
        type="button"
        className="fixed bottom-20 right-4 z-40 inline-flex min-h-11 items-center rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(17,19,24,0.28)] lg:hidden"
        aria-expanded={notesOpen}
        onClick={() => setNotesOpen(true)}
      >
        Notes ({noteCount})
      </button>

      {notesOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Notes and highlights">
          <button
            type="button"
            className="absolute inset-0 bg-ink/40"
            aria-label="Close notes"
            onClick={() => setNotesOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-[20px] bg-[#F3F4F6] shadow-[0_-8px_28px_rgba(17,19,24,0.18)]">
            <div className="flex shrink-0 items-center justify-center pt-2">
              <span className="h-1 w-10 rounded-full bg-[#C8CCD4]" aria-hidden />
            </div>
            <div className="flex flex-col gap-3 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
              <NotesPanel
                caseId={caseId}
                notes={notes}
                marks={marks}
                passages={reading.passages}
                noteDraft={noteDraft}
                setNoteDraft={setNoteDraft}
                busy={busy}
                save={save}
                onClose={() => setNotesOpen(false)}
              />
              <Link
                href={`/case-brain/${caseId}?tab=working`}
                className="mb-2 rounded-xl border border-mist bg-white px-4 py-2.5 text-center text-sm font-semibold"
                onClick={() => setNotesOpen(false)}
              >
                Go to the working document
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {sel ? (
        <div
          ref={toolbarRef}
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
                className="min-h-11 rounded-lg bg-[#FFE58A] px-2.5 py-1.5 text-xs font-semibold"
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
              <button
                type="button"
                className="min-h-11 rounded-lg bg-[#E8F0FE] px-2.5 py-1.5 text-xs font-semibold"
                onClick={() => setCommentDraft("")}
              >
                Comment
              </button>
              <button
                type="button"
                className="min-h-11 rounded-lg bg-ink px-2.5 py-1.5 text-xs font-semibold text-white"
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
              <button type="button" className="ml-auto min-h-11 px-2 text-xs text-muted" onClick={() => setSel(null)}>
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
                  className="min-h-11 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
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
                <button type="button" className="min-h-11 text-xs text-muted" onClick={() => setCommentDraft(null)}>
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
