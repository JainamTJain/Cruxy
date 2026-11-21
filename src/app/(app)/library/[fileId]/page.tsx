"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

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
  created_at: string;
};

type CasePage = {
  id: string;
  number: number;
  title: string;
  crux: string | null;
  trap: string | null;
};

export default function ReadingRoomPage() {
  const params = useParams<{ fileId: string }>();
  const fileId = params.fileId;

  const [file, setFile] = useState<{
    name: string;
    drive_id: string | null;
    type: string | null;
    case_numbers: number[];
    card: string | null;
  } | null>(null);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [casePages, setCasePages] = useState<CasePage[]>([]);
  const [selected, setSelected] = useState<Passage | null>(null);
  const [selection, setSelection] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [askResult, setAskResult] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      casePages: CasePage[];
    };
    setFile(data.file);
    setPassages(data.passages);
    setComments(data.comments);
    setCasePages(data.casePages);
    setSelected(data.passages[0] ?? null);
  }, [fileId]);

  useEffect(() => {
    void load();
  }, [load]);

  function captureSelection() {
    const t = window.getSelection()?.toString().trim() ?? "";
    if (t) setSelection(t);
  }

  async function saveHighlight() {
    if (!selected) return;
    const text = selection || selected.text.slice(0, 120);
    const res = await fetch("/api/library/highlights", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        passageId: selected.id,
        range: "0:0",
        body: text,
      }),
    });
    setStatus(res.ok ? "Highlight saved for all teams." : "Highlight failed.");
  }

  async function postComment() {
    if (!selected || !commentBody.trim()) return;
    const res = await fetch("/api/library/comments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        passageId: selected.id,
        body: commentBody,
        range: selection ? "selection" : null,
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
    if (!selected) return;
    setAskResult(null);
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
    };
    if (!res.ok) {
      setAskResult(data.error ?? "Cruxy could not answer.");
      return;
    }
    const cite = data.citation
      ? `\n\n— ${data.citation.anchor} (${data.citation.passage_id.slice(0, 8)})`
      : "";
    setAskResult(`${data.answer ?? ""}${cite}`);
  }

  async function turnInto(action: "flashcard" | "proposal") {
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

  return (
    <main className="animate-fade-up space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <Link href="/library" className="text-xs text-muted underline">
            Library
          </Link>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">
            {file.name}
          </h1>
          <p className="text-xs text-muted">
            {file.type}
            {file.drive_id ? ` · drive ${file.drive_id.slice(0, 12)}` : " · sample"}
            {file.case_numbers.length
              ? ` · cases ${file.case_numbers.join(", ")}`
              : ""}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-ink/10 bg-white/55 p-4">
          <h2 className="font-display text-lg font-semibold">Case set</h2>
          {casePages.length === 0 ? (
            <p className="mt-2 text-sm text-muted">
              No tagged cases yet — open sorting queue if confidence is low.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {casePages.map((c) => (
                <li key={c.id} className="border-t border-ink/5 pt-3 first:border-0 first:pt-0">
                  <p className="font-medium">
                    Case {c.number}: {c.title}
                  </p>
                  {c.crux ? (
                    <p className="mt-1 text-sm text-ink/80">{c.crux}</p>
                  ) : (
                    <p className="mt-1 text-sm text-muted">
                      Case card details fill in as the case set is digested.
                    </p>
                  )}
                  {c.trap ? (
                    <p className="mt-1 text-xs text-muted">Trap: {c.trap}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {file.card ? (
            <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-mist/50 p-3 font-sans text-xs">
              {file.card}
            </pre>
          ) : null}
        </section>

        <section className="rounded-2xl border border-ink/10 bg-white/55 p-4">
          <h2 className="font-display text-lg font-semibold">File</h2>
          <div className="mt-2 flex flex-wrap gap-1">
            {passages.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p)}
                className={`rounded-lg px-2 py-1 font-mono text-[10px] ${
                  selected?.id === p.id
                    ? "bg-ink text-white"
                    : "bg-mist/80 text-ink/70"
                }`}
              >
                {p.anchor.slice(0, 18)}
              </button>
            ))}
          </div>
          {selected ? (
            <article
              className="mt-3 max-h-[50vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed"
              onMouseUp={captureSelection}
              onTouchEnd={captureSelection}
            >
              {selected.text}
            </article>
          ) : null}
          <p className="mt-2 font-mono text-[10px] text-muted">
            {selected
              ? `passage ${selected.id.slice(0, 8)} · ${selected.anchor}${
                  selected.drive_id ? ` · drive ${selected.drive_id.slice(0, 10)}` : ""
                }`
              : ""}
          </p>
        </section>
      </div>

      <section className="rounded-2xl border border-ink/10 bg-white/70 p-4">
        <h2 className="font-display text-lg font-semibold">Highlight tools</h2>
        {selection ? (
          <p className="mt-2 rounded-xl bg-gold/15 px-3 py-2 text-sm">
            Selected: {selection.slice(0, 200)}
            {selection.length > 200 ? "…" : ""}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Select text in the file pane, or use the whole passage.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => void saveHighlight()}>
            Highlight
          </Button>
          <Button type="button" variant="secondary" onClick={() => void askCruxy("explain")}>
            Explain
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void askCruxy("counterexample")}
          >
            Counterexample
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void askCruxy("cited_elsewhere")}
          >
            Cited elsewhere?
          </Button>
          <Button type="button" variant="secondary" onClick={() => void turnInto("flashcard")}>
            → Flashcard
          </Button>
          <Button type="button" onClick={() => void turnInto("proposal")}>
            → Truth Source
          </Button>
        </div>
        {askResult ? (
          <p className="mt-3 whitespace-pre-wrap rounded-xl border border-ink/10 bg-paper px-3 py-2 text-sm">
            {askResult}
          </p>
        ) : null}
        {status ? <p className="mt-2 text-xs text-muted">{status}</p> : null}

        <div className="mt-4 space-y-2">
          <label className="block text-xs font-medium text-muted">
            Comment (visible to all teams)
          </label>
          <textarea
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
            placeholder="Leave a threaded note…"
          />
          <Button type="button" onClick={() => void postComment()}>
            Post comment
          </Button>
        </div>

        <ul className="mt-4 space-y-2">
          {comments.map((c) => (
            <li
              key={c.id}
              className="rounded-xl border border-ink/5 px-3 py-2 text-sm"
              style={{
                borderLeftWidth: 3,
                borderLeftColor: c.team_colour ?? "#5c6170",
              }}
            >
              <span className="font-medium">{c.person_name}</span>{" "}
              <span className="font-mono text-[10px] text-muted">
                {c.passage_anchor}
              </span>
              <p className="mt-1">{c.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
