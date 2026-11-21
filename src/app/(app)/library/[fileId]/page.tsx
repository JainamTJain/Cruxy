"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useCruxy } from "@/components/cruxy/cruxy-context";

type Passage = {
  id: string;
  drive_id: string | null;
  anchor: string;
  text: string;
  ord: number;
};

type CommentRow = {
  id: string;
  passage_id: string;
  body: string;
  person_name: string;
  team_colour: string | null;
  passage_anchor: string;
  range: string | null;
  created_at: string;
};

type CasePage = {
  id: string;
  number: number;
  title: string;
  case_set_page: string | null;
  crux: string | null;
  trap: string | null;
};

type Related = {
  id: string;
  name: string;
  path: string | null;
  type: string | null;
  case_numbers: number[];
};

type HighlightRow = {
  id: string;
  passage_id: string;
  body: string | null;
  range: string;
};

export default function ReadingRoomPage() {
  const params = useParams<{ fileId: string }>();
  const fileId = params.fileId;
  const { setMood, setCaseId, setHighlight } = useCruxy();

  const [file, setFile] = useState<{
    name: string;
    drive_id: string | null;
    type: string | null;
    case_numbers: number[];
    card: string | null;
    path: string | null;
  } | null>(null);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [highlights, setHighlights] = useState<HighlightRow[]>([]);
  const [casePages, setCasePages] = useState<CasePage[]>([]);
  const [related, setRelated] = useState<Related[]>([]);
  const [selection, setSelection] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [askResult, setAskResult] = useState<string | null>(null);
  const [askCitations, setAskCitations] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"case" | "file" | string>("file");

  const primaryCase =
    casePages.find((c) => c.number === 9) ??
    casePages.find((c) => file?.case_numbers.includes(c.number)) ??
    casePages[0] ??
    null;

  const load = useCallback(async () => {
    const res = await fetch(`/api/library/files/${fileId}`);
    if (!res.ok) {
      setError("Could not open file.");
      return;
    }
    const data = (await res.json()) as {
      file: typeof file;
      passages: Passage[];
      comments: CommentRow[];
      highlights: HighlightRow[];
      casePages: CasePage[];
      related: Related[];
    };
    setFile(data.file);
    setPassages(data.passages);
    setComments(data.comments);
    setHighlights(data.highlights ?? []);
    setCasePages(data.casePages);
    setRelated(data.related ?? []);
    if (data.casePages[0]) {
      setCaseId(data.casePages[0].id);
      setMood("curious");
    }
  }, [fileId, setCaseId, setMood]);

  useEffect(() => {
    void load();
  }, [load]);

  const fullText = useMemo(
    () => passages.map((p) => p.text).join("\n\n"),
    [passages],
  );

  const highlightBodies = useMemo(
    () =>
      new Set(
        highlights
          .map((h) => h.body?.trim())
          .filter((b): b is string => Boolean(b && b.length > 8)),
      ),
    [highlights],
  );

  function captureSelection() {
    const t = window.getSelection()?.toString().trim() ?? "";
    if (t) {
      setSelection(t);
      setHighlight(t);
    }
  }

  function passageForSelection(): Passage | null {
    if (!selection) return passages[0] ?? null;
    return (
      passages.find((p) => p.text.includes(selection.slice(0, 40))) ??
      passages[0] ??
      null
    );
  }

  async function saveHighlight() {
    const selected = passageForSelection();
    if (!selected) return;
    const text = selection || selected.text.slice(0, 120);
    const res = await fetch("/api/library/highlights", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        passageId: selected.id,
        range: "selection",
        body: text,
      }),
    });
    setStatus(res.ok ? "Highlight saved for all teams." : "Highlight failed.");
    if (res.ok) await load();
  }

  async function postComment() {
    const selected = passageForSelection();
    if (!selected || !commentBody.trim()) return;
    const res = await fetch("/api/library/comments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        passageId: selected.id,
        body: commentBody,
        range: selection ? selection.slice(0, 80) : null,
      }),
    });
    if (res.ok) {
      setCommentBody("");
      setStatus("Comment posted.");
      await load();
    } else {
      setStatus("Comment failed.");
    }
  }

  async function askCruxy(
    action: "explain" | "counterexample" | "cited_elsewhere",
  ) {
    const selected = passageForSelection();
    if (!selected) return;
    setAskResult(null);
    setAskCitations(null);
    setMood("curious");
    const res = await fetch("/api/library/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        passageId: selected.id,
        highlightText: selection || selected.text.slice(0, 280),
        action,
      }),
    });
    const data = (await res.json()) as {
      answer?: string;
      error?: string;
      citation?: { passage_id: string; anchor: string };
      citations?: { passage_id: string; anchor: string }[];
    };
    if (!res.ok) {
      setAskResult(data.error ?? "Cruxy could not answer.");
      return;
    }
    setAskResult(data.answer ?? "");
    const cites =
      data.citations?.map((c) => c.anchor).join(", ") ??
      (data.citation ? data.citation.anchor : null);
    setAskCitations(cites);
    setMood("surprised");
  }

  async function turnInto(action: "flashcard" | "proposal") {
    const selected = passageForSelection();
    if (!selected) return;
    const res = await fetch("/api/library/highlight-actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        passageId: selected.id,
        highlightText: selection || selected.text.slice(0, 280),
        action,
      }),
    });
    setStatus(
      res.ok
        ? action === "flashcard"
          ? "Flashcard created from highlight."
          : "Truth Source proposal queued."
        : "Action failed.",
    );
    if (res.ok) setMood("happy");
  }

  function renderDocBody(text: string) {
    if (!selection && highlightBodies.size === 0) {
      return text.split("\n\n").map((para, i) => (
        <p key={i} className="m-0">
          {para}
        </p>
      ));
    }
    // Soft-mark the current selection and saved highlights in the prose.
    const body = text;
    const marks: { from: number; to: number; kind: "sel" | "team" }[] = [];
    if (selection) {
      const idx = body.indexOf(selection);
      if (idx >= 0) marks.push({ from: idx, to: idx + selection.length, kind: "sel" });
    }
    for (const h of highlightBodies) {
      const idx = body.indexOf(h);
      if (idx >= 0) marks.push({ from: idx, to: idx + h.length, kind: "team" });
    }
    marks.sort((a, b) => a.from - b.from);
    const nodes: ReactNode[] = [];
    let cursor = 0;
    let key = 0;
    for (const m of marks) {
      if (m.from < cursor) continue;
      if (m.from > cursor) nodes.push(body.slice(cursor, m.from));
      const slice = body.slice(m.from, m.to);
      nodes.push(
        m.kind === "sel" ? (
          <mark
            key={key++}
            className="rounded-[3px] bg-[#FFE58A] px-0.5"
          >
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
      cursor = m.to;
    }
    if (cursor < body.length) nodes.push(body.slice(cursor));
    return <p className="m-0 whitespace-pre-wrap">{nodes}</p>;
  }

  if (error) {
    return (
      <main className="space-y-4">
        <p className="text-sm text-cardinal">{error}</p>
        <Link href="/library" className="text-sm underline">
          Back to library
        </Link>
      </main>
    );
  }

  if (!file) {
    return <main className="text-sm text-muted">Opening reading room…</main>;
  }

  const caseLabel = primaryCase
    ? `Case ${primaryCase.number}`
    : file.case_numbers.length
      ? `Case ${file.case_numbers.join(", ")}`
      : "General";

  return (
    <main className="flex flex-col gap-[18px] animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
            Reading room, {caseLabel}
          </span>
          <h1 className="font-display text-[34px] font-extrabold leading-none tracking-[-0.02em]">
            {primaryCase?.title ?? file.name}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("case")}
            className={`rounded-[10px] border px-3.5 py-2 text-sm font-semibold ${
              activeTab === "case"
                ? "border-ink bg-ink text-white"
                : "border-[#E3E5E9] bg-white text-[#3B404A]"
            }`}
          >
            Case set
            {primaryCase?.case_set_page
              ? `, p. ${primaryCase.case_set_page}`
              : ""}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("file")}
            className={`rounded-[10px] border px-3.5 py-2 text-sm font-semibold ${
              activeTab === "file"
                ? "border-ink bg-ink text-white"
                : "border-[#E3E5E9] bg-white text-[#3B404A]"
            }`}
          >
            {file.name.length > 36 ? `${file.name.slice(0, 34)}…` : file.name}
            {file.drive_id ? " (Drive)" : ""}
          </button>
          {related.slice(0, 2).map((r) => (
            <Link
              key={r.id}
              href={`/library/${r.id}`}
              className="rounded-[10px] border border-[#E3E5E9] bg-white px-3.5 py-2 text-sm font-semibold text-[#3B404A]"
            >
              {r.name.length > 28 ? `${r.name.slice(0, 26)}…` : r.name}
            </Link>
          ))}
          {related.length > 2 ? (
            <Link
              href="/library"
              className="rounded-[10px] border border-[#E3E5E9] bg-white px-3.5 py-2 text-sm font-semibold text-[#3B404A]"
            >
              + {related.length - 2} more
            </Link>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <article className="min-w-0 flex-[999_1_560px] rounded-[20px] bg-white px-8 py-10 sm:px-14">
          <div
            className="mx-auto flex max-w-[680px] flex-col gap-[18px] text-[19px] leading-[1.7] text-[#1C1F26]"
            style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
            onMouseUp={captureSelection}
            onTouchEnd={captureSelection}
          >
            {activeTab === "case" && primaryCase ? (
              <>
                {primaryCase.crux ? (
                  <p className="m-0">
                    <strong>Crux.</strong> {primaryCase.crux}
                  </p>
                ) : null}
                {primaryCase.trap ? (
                  <p className="m-0">
                    <strong>Trap.</strong> {primaryCase.trap}
                  </p>
                ) : null}
                {!primaryCase.crux && !primaryCase.trap ? (
                  <p className="m-0 text-muted">
                    Case card details fill in as the case set is digested.
                  </p>
                ) : null}
              </>
            ) : (
              renderDocBody(fullText || "(Empty file.)")
            )}
            {file.card ? (
              <p className="m-0 font-sans text-[15px] text-muted">
                File card: {file.card.split("\n")[0]}
              </p>
            ) : null}
            {passages[0]?.drive_id || passages[0]?.id ? (
              <p className="m-0 font-mono text-[11px] text-muted">
                Cite {passages[0]?.anchor ?? ""}
                {passages[0]?.drive_id
                  ? ` (drive ${passages[0].drive_id.slice(0, 10)})`
                  : passages[0]?.id
                    ? ` (${passages[0].id.slice(0, 8)})`
                    : ""}
              </p>
            ) : null}
          </div>
        </article>

        <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
          <section className="flex flex-col gap-3 rounded-[20px] bg-ink p-5 text-white">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#9AA0AA]">
              Your highlight
            </span>
            <p
              className="m-0 text-[18px] italic leading-[1.45] text-[#FFE58A]"
              style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
            >
              {selection
                ? `“${selection.slice(0, 160)}${selection.length > 160 ? "…" : ""}”`
                : "Select text in the file to ask Cruxy about it."}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void askCruxy("explain")}
                className="h-[38px] rounded-[10px] border border-gold bg-gold px-3 text-left text-[13px] font-semibold text-ink"
              >
                Cruxy: is this accurate?
              </button>
              <button
                type="button"
                onClick={() => void askCruxy("counterexample")}
                className="h-[38px] rounded-[10px] border border-[#E3E5E9] bg-white px-3 text-left text-[13px] font-semibold text-ink"
              >
                Find a counterexample
              </button>
              <button
                type="button"
                onClick={() => void turnInto("flashcard")}
                className="h-[38px] rounded-[10px] border border-[#E3E5E9] bg-white px-3 text-left text-[13px] font-semibold text-ink"
              >
                Make a flashcard
              </button>
              <button
                type="button"
                onClick={() => void turnInto("proposal")}
                className="h-[38px] rounded-[10px] border border-[#E3E5E9] bg-white px-3 text-left text-[13px] font-semibold text-ink"
              >
                Propose to Truth Sources
              </button>
            </div>
            <button
              type="button"
              onClick={() => void saveHighlight()}
              className="h-[38px] rounded-[10px] border border-white/20 bg-[#1E2129] px-3 text-left text-[13px] font-semibold text-white"
            >
              Save highlight
            </button>
            {askResult ? (
              <div className="rounded-xl bg-[#1E2129] p-3 text-sm leading-relaxed text-[#D6D9DF]">
                <strong className="text-gold">Cruxy:</strong> {askResult}{" "}
                {askCitations ? (
                  <span className="underline">{askCitations} sources</span>
                ) : null}
              </div>
            ) : null}
            {status ? (
              <p className="text-xs text-[#9AA0AA]">{status}</p>
            ) : null}
          </section>

          <section className="flex flex-col gap-3.5 rounded-[20px] bg-white p-5">
            <h2 className="font-display m-0 text-xl font-extrabold">
              Comments on this page, all teams
            </h2>
            {comments.length === 0 ? (
              <p className="text-sm text-muted">No comments yet.</p>
            ) : (
              comments.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col gap-1.5 rounded-xl bg-[#F7F8FA] p-3"
                >
                  <span className="text-[13px]">
                    <strong style={{ color: c.team_colour ?? "#5A606B" }}>
                      {c.person_name}
                    </strong>
                    {c.range ? (
                      <span className="text-muted"> on “{c.range}”</span>
                    ) : c.passage_anchor ? (
                      <span className="font-mono text-[10px] text-muted">
                        {" "}
                        ({c.passage_anchor})
                      </span>
                    ) : null}
                  </span>
                  <span className="text-sm leading-snug">{c.body}</span>
                  <span className="text-[13px] text-muted">Reply</span>
                </div>
              ))
            )}
            <label htmlFor="nc" className="text-[13px] font-semibold">
              Add a comment on your highlight
            </label>
            <input
              id="nc"
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              placeholder="Visible to all three teams"
              className="h-11 rounded-xl border border-[#E3E5E9] px-3 text-sm"
            />
            <button
              type="button"
              onClick={() => void postComment()}
              className="h-11 rounded-xl bg-ink text-sm font-semibold text-white"
            >
              Post comment
            </button>
          </section>
        </aside>
      </div>
    </main>
  );
}
