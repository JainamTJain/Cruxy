"use client";

import { useEffect, useRef, useState } from "react";

type CaptionLine = { id: string; text: string; at: number };

type Props = {
  /** Also show lines Cruxy spoke aloud (SpeechSynthesis). */
  cruxyLines?: string[];
  enabled?: boolean;
};

/**
 * F-217 / F-222: rough live captions from the browser's speech recognition
 * (Chrome). Everything Cruxy says aloud is listed as text too.
 */
export function LiveCaptions({ cruxyLines = [], enabled = true }: Props) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [lines, setLines] = useState<CaptionLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const recogRef = useRef<{
    start: () => void;
    stop: () => void;
    onresult: ((ev: unknown) => void) | null;
    onerror: ((ev: unknown) => void) | null;
    continuous: boolean;
    interimResults: boolean;
    lang: string;
  } | null>(null);

  useEffect(() => {
    const W = window as unknown as {
      SpeechRecognition?: new () => (typeof recogRef)["current"];
      webkitSpeechRecognition?: new () => (typeof recogRef)["current"];
    };
    const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
    setSupported(Boolean(Ctor) && enabled);
    if (!Ctor || !enabled) return;

    const recog = new Ctor()!;
    recog.continuous = true;
    recog.interimResults = true;
    recog.lang = "en-US";
    recog.onresult = (ev: unknown) => {
      const e = ev as {
        resultIndex: number;
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
      };
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        if (!r.isFinal) continue;
        const text = r[0]?.transcript?.trim();
        if (!text) continue;
        setLines((prev) => [
          ...prev.slice(-20),
          { id: `${Date.now()}-${i}`, text, at: Date.now() },
        ]);
      }
    };
    recog.onerror = () => {
      setError("Captions paused. Tap Start captions to try again.");
      setListening(false);
    };
    recogRef.current = recog;
    return () => {
      try {
        recog.stop();
      } catch {
        /* ignore */
      }
    };
  }, [enabled]);

  function toggle() {
    setError(null);
    const recog = recogRef.current;
    if (!recog) return;
    if (listening) {
      try {
        recog.stop();
      } catch {
        /* ignore */
      }
      setListening(false);
      return;
    }
    try {
      recog.start();
      setListening(true);
    } catch {
      setError("Could not start captions in this browser.");
    }
  }

  return (
    <div className="flex flex-col gap-2.5 border-t border-[#262934] pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#8C929D]">
          Live captions (rough). Final transcript comes after
        </span>
        {supported ? (
          <button
            type="button"
            onClick={toggle}
            className="rounded-lg border border-[#3B404A] px-3 py-1 text-xs font-semibold text-[#C9CCD3]"
          >
            {listening ? "Stop captions" : "Start captions"}
          </button>
        ) : (
          <span className="text-xs text-[#8C929D]">
            Live captions need Chrome on this device
          </span>
        )}
      </div>
      {error ? <p className="m-0 text-sm text-[#F87171]">{error}</p> : null}
      {cruxyLines.length ? (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#8C929D]">
            Cruxy said
          </span>
          {cruxyLines.slice(-3).map((t, i) => (
            <p key={`c-${i}`} className="m-0 text-[15px] leading-relaxed text-[#E8C36A]">
              {t}
            </p>
          ))}
        </div>
      ) : null}
      {lines.length === 0 && cruxyLines.length === 0 ? (
        <p className="m-0 text-[17px] leading-relaxed text-[#C9CCD3]">
          Captions appear as people speak. The final transcript is saved after
          the round; audio is deleted then.
        </p>
      ) : (
        lines.slice(-4).map((l) => (
          <p
            key={l.id}
            className="m-0 text-[17px] leading-relaxed text-[#C9CCD3]"
          >
            {l.text}
          </p>
        ))
      )}
    </div>
  );
}
