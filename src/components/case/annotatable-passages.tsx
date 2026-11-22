"use client";

import {
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LinkedText } from "@/components/frameworks/linked-text";
import { cn } from "@/lib/utils";

export type AnnotatablePassage = {
  id: string;
  text: string;
};

type Mark = { needle: string; kind: "highlight" | "comment" };

function markText(text: string, marks: Mark[], caseId?: string | null) {
  const hits: { from: number; to: number; kind: "highlight" | "comment" }[] =
    [];
  for (const m of marks) {
    const needle = m.needle.trim();
    if (needle.length < 6) continue;
    const idx = text.indexOf(needle);
    if (idx >= 0) hits.push({ from: idx, to: idx + needle.length, kind: m.kind });
  }
  hits.sort((a, b) => a.from - b.from);
  if (hits.length === 0) {
    return <LinkedText text={text} caseId={caseId} />;
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  for (const h of hits) {
    if (h.from < cursor) continue;
    if (h.from > cursor) {
      nodes.push(
        <LinkedText
          key={`l-${key++}`}
          text={text.slice(cursor, h.from)}
          caseId={caseId}
        />,
      );
    }
    const slice = text.slice(h.from, h.to);
    nodes.push(
      h.kind === "highlight" ? (
        <mark key={key++} className="rounded-[3px] bg-[#FFE58A] px-0.5">
          <LinkedText text={slice} caseId={caseId} />
        </mark>
      ) : (
        <span
          key={key++}
          className="border-b-2 border-[#0F7B6C] bg-[#D8EEEB]"
        >
          <LinkedText text={slice} caseId={caseId} />
        </span>
      ),
    );
    cursor = h.to;
  }
  if (cursor < text.length) {
    nodes.push(
      <LinkedText
        key={`l-${key++}`}
        text={text.slice(cursor)}
        caseId={caseId}
      />,
    );
  }
  return nodes;
}

/**
 * Shared select → Highlight / Ask a question / Add a note tools
 * for the case text and for reading full originals.
 */
export function AnnotatablePassages({
  passages,
  marks,
  onSaved,
  className,
  caseId = null,
  hint = "Select any words to highlight them, ask a question or leave a note.",
}: {
  passages: AnnotatablePassage[];
  marks: Mark[];
  onSaved?: () => void | Promise<void>;
  className?: string;
  caseId?: string | null;
  hint?: string;
}) {
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

  const markList = useMemo(() => marks, [marks]);

  function captureSelection() {
    const s = window.getSelection();
    const text = s?.toString().replace(/\s+/g, " ").trim() ?? "";
    if (!s || text.length < 3 || !articleRef.current) {
      if (!mode) setSel(null);
      return;
    }
    const node =
      s.anchorNode instanceof Element ? s.anchorNode : s.anchorNode?.parentElement;
    const para = node?.closest("[data-passage-id]") as HTMLElement | null;
    const passageId = para?.dataset.passageId;
    if (!passageId) return;
    const rect = s.getRangeAt(0).getBoundingClientRect();
    const box = articleRef.current.getBoundingClientRect();
    setSel({
      text: text.slice(0, 400),
      passageId,
      top: rect.bottom - box.top + 8,
    });
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
              body:
                kind === "question" ? `Question: ${draft.trim()}` : draft.trim(),
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
          ? "Question added."
          : "Note added.",
    );
    setSel(null);
    setMode(null);
    setDraft("");
    window.getSelection()?.removeAllRanges();
    await onSaved?.();
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <p className="m-0 text-xs text-muted">{hint}</p>
      {status ? (
        <p className="m-0 text-sm font-semibold text-[#1F7A4D]" role="status">
          {status}
        </p>
      ) : null}
      <div
        ref={articleRef}
        onMouseUp={captureSelection}
        onTouchEnd={() => window.setTimeout(captureSelection, 50)}
        className="relative max-h-[420px] overflow-y-auto rounded-xl border border-[#E3E5E9] bg-[#F7F8FA] p-3 text-sm leading-relaxed"
        style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
      >
        {passages.map((p) => (
          <p key={p.id} className="m-0 mb-3 last:mb-0" data-passage-id={p.id}>
            {markText(p.text, markList, caseId)}
          </p>
        ))}

        {sel ? (
          <div
            className="absolute left-2 right-2 z-20 mx-auto w-[calc(100%-1rem)] max-w-[520px] rounded-2xl border border-ink/10 bg-white p-3 font-sans text-sm shadow-[0_10px_30px_rgba(17,19,24,0.14)]"
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
                <textarea
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
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={busy || !draft.trim()}
                    className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted"
                    onClick={() => {
                      setMode(null);
                      setDraft("");
                    }}
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
                  className="rounded-lg bg-[#FFE58A] px-3 py-1.5 text-xs font-semibold text-ink"
                >
                  Highlight
                </button>
                <button
                  type="button"
                  onClick={() => setMode("question")}
                  className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-semibold"
                >
                  Ask a question
                </button>
                <button
                  type="button"
                  onClick={() => setMode("note")}
                  className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-semibold"
                >
                  Add a note
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
