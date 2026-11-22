"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ExplainResult = {
  term: string;
  meaning: string;
  source: "glossary" | "cruxy";
};

/**
 * Select a word or short phrase in the main page, then get a plain one-line
 * meaning (G glossary seed first, then Cruxy).
 */
export function ExplainTermListener() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [result, setResult] = useState<ExplainResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setResult(null);
    setError(null);
    setBusy(false);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        e.preventDefault();
        close();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    function onMouseUp() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const text = sel.toString().trim();
      if (!text || text.length < 2 || text.length > 80) return;
      if (text.split(/\s+/).length > 8) return;
      const anchor = sel.anchorNode?.parentElement;
      if (!anchor) return;
      if (anchor.closest("[data-no-explain], aside, nav, header, [role=dialog]")) {
        return;
      }
      const main = document.getElementById("main-content");
      if (main && !main.contains(anchor)) return;

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setTerm(text);
      setPos({
        x: Math.min(window.innerWidth - 280, Math.max(12, rect.left)),
        y: Math.min(window.innerHeight - 120, rect.bottom + 8),
      });
      setResult(null);
      setError(null);
      setOpen(true);
    }
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, []);

  async function explain() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/access/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ term }),
      });
      const data = (await res.json()) as ExplainResult & { error?: string };
      if (!res.ok) {
        setError(
          data.error ??
            "Could not explain that. Try a shorter phrase, or open Help when it is ready.",
        );
        return;
      }
      setResult(data);
    } catch {
      setError("Network hiccup. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Explain this term"
      className="fixed z-[70] w-[min(280px,calc(100vw-24px))] rounded-2xl border border-ink/15 bg-white p-3 shadow-xl"
      style={{ left: pos.x, top: pos.y }}
    >
      <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted">
        Explain this term
      </p>
      <p className="mt-1 text-sm font-semibold text-ink">&ldquo;{term}&rdquo;</p>
      {result ? (
        <div className="mt-2 space-y-1">
          <p className="m-0 text-sm leading-snug text-ink">{result.meaning}</p>
          <p className="m-0 text-[11px] text-muted">
            {result.source === "glossary"
              ? "From the Crux glossary"
              : "Plain reading from Cruxy"}
          </p>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted">
          Get a one-line plain meaning. Useful when English is a second language.
        </p>
      )}
      {error ? (
        <p className="mt-2 text-xs text-cardinal" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {!result ? (
          <button
            type="button"
            className="min-h-11 rounded-xl bg-cardinal px-3 py-2 text-sm font-semibold text-white"
            disabled={busy}
            onClick={() => void explain()}
          >
            {busy ? "Looking up…" : "Explain"}
          </button>
        ) : null}
        <button
          type="button"
          className="min-h-11 rounded-xl border border-ink/15 px-3 py-2 text-sm"
          onClick={close}
        >
          Close
        </button>
      </div>
    </div>
  );
}
