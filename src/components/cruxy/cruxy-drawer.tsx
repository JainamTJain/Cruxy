"use client";

import { useState } from "react";
import { useCruxy } from "@/components/cruxy/cruxy-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Cite = { id: string; text: string; kind: string };

export function CruxyDrawer() {
  const {
    drawerOpen,
    setDrawerOpen,
    page,
    highlight,
    caseId,
    sleep,
    setMood,
    setBubble,
  } = useCruxy();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [citations, setCitations] = useState<Cite[]>([]);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!drawerOpen) return null;

  async function ask() {
    if (!question.trim()) return;
    setBusy(true);
    setMood("neutral");
    try {
      const res = await fetch("/api/cruxy/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question,
          page,
          highlight,
          caseId,
        }),
      });
      const data = (await res.json()) as {
        text: string;
        citations: Cite[];
        refusedWithoutSources: boolean;
        questionFirst: string | null;
      };
      if (data.questionFirst && !prompt) {
        setPrompt(data.questionFirst);
        setBubble(data.questionFirst);
        setMood("curious");
      } else {
        setAnswer(data.text);
        setCitations(data.citations ?? []);
        setMood(data.refusedWithoutSources ? "surprised" : "winking");
        setBubble(null);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-ink/10 bg-paper/98 shadow-xl backdrop-blur",
      )}
      role="dialog"
      aria-label="Cruxy assistant"
    >
      <header className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
        <div>
          <p className="font-display text-lg font-semibold text-cardinal">
            Cruxy
          </p>
          <p className="text-[11px] text-muted">
            Knows this page · cites Truth Sources first
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg px-2 py-1 text-sm text-muted"
          onClick={() => setDrawerOpen(false)}
        >
          Close
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm">
        <p className="rounded-xl bg-mist/60 px-3 py-2 text-xs text-muted">
          Page: <span className="font-mono text-ink">{page}</span>
          {highlight ? (
            <>
              <br />
              Highlight: {highlight}
            </>
          ) : null}
        </p>

        {prompt ? (
          <div className="rounded-2xl border border-gold/40 bg-gold/10 px-3 py-3">
            <p className="font-medium">Cruxy asks first</p>
            <p className="mt-1">{prompt}</p>
            <Button
              className="mt-3"
              variant="secondary"
              onClick={() => {
                setPrompt(null);
                void ask();
              }}
            >
              I tried — give me the answer
            </Button>
          </div>
        ) : null}

        {answer ? (
          <div className="space-y-2">
            <p className="rounded-2xl bg-white/80 px-3 py-3">{answer}</p>
            {citations.length ? (
              <ul className="space-y-1 text-xs text-muted">
                {citations.map((c, i) => (
                  <li key={c.id} className="border-l-2 border-cardinal/40 pl-2">
                    [T{i + 1}] {c.kind}: {c.text}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <footer className="space-y-2 border-t border-ink/10 p-4">
        <textarea
          className="min-h-[72px] w-full rounded-xl border border-ink/15 bg-white/80 px-3 py-2 text-sm"
          placeholder="Ask Cruxy…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <div className="flex gap-2">
          <Button
            className="flex-1"
            disabled={busy}
            onClick={() => {
              setPrompt(null);
              void ask();
            }}
          >
            {busy ? "Thinking…" : "Ask"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setDrawerOpen(false);
              sleep();
            }}
          >
            Back to the lamp
          </Button>
        </div>
      </footer>
    </div>
  );
}
