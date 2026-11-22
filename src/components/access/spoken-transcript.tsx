"use client";

import { useEffect, useState } from "react";
import { SPEECH_CAPTION_EVENT } from "@/components/access/live-region";

/**
 * On-screen transcript for anything spoken with speakText / speechSynthesis.
 * Colour is never the only cue: a clear "Spoken aloud" label sits with the text.
 */
export function SpokenTranscriptHost() {
  const [lines, setLines] = useState<{ id: string; text: string }[]>([]);

  useEffect(() => {
    function onCaption(e: Event) {
      const text = (e as CustomEvent<{ text?: string }>).detail?.text?.trim();
      if (!text) return;
      setLines((prev) => [
        ...prev.slice(-8),
        { id: `${Date.now()}`, text },
      ]);
    }
    window.addEventListener(SPEECH_CAPTION_EVENT, onCaption);
    return () => window.removeEventListener(SPEECH_CAPTION_EVENT, onCaption);
  }, []);

  if (!lines.length) return null;

  return (
    <aside
      className="fixed bottom-24 left-4 right-4 z-40 mx-auto max-w-xl rounded-2xl border border-ink/20 bg-white/95 p-3 shadow-lg sm:bottom-6 sm:left-auto sm:right-6"
      aria-label="Spoken aloud transcript"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Spoken aloud
        </p>
        <button
          type="button"
          className="min-h-11 text-xs font-semibold text-cardinal underline"
          onClick={() => setLines([])}
        >
          Clear transcript
        </button>
      </div>
      <ul className="m-0 max-h-40 list-none space-y-1 overflow-y-auto p-0">
        {lines.map((l) => (
          <li key={l.id} className="text-sm text-ink">
            {l.text}
          </li>
        ))}
      </ul>
    </aside>
  );
}
