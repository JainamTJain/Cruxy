"use client";

import { useEffect, useState } from "react";

export const CRUXY_LIVE_EVENT = "crux-live-announce";
export const TIMER_LIVE_EVENT = "crux-timer-announce";
export const SPEECH_CAPTION_EVENT = "crux-speech-caption";

type AnnounceDetail = { message: string; assertive?: boolean };

/** Polite/assertive live regions for Cruxy replies and timers. */
export function AccessLiveRegions() {
  const [polite, setPolite] = useState("");
  const [assertive, setAssertive] = useState("");

  useEffect(() => {
    function onCruxy(e: Event) {
      const d = (e as CustomEvent<AnnounceDetail>).detail;
      if (!d?.message) return;
      if (d.assertive) setAssertive(d.message);
      else setPolite(d.message);
    }
    function onTimer(e: Event) {
      const d = (e as CustomEvent<AnnounceDetail>).detail;
      if (!d?.message) return;
      setAssertive(d.message);
    }
    window.addEventListener(CRUXY_LIVE_EVENT, onCruxy);
    window.addEventListener(TIMER_LIVE_EVENT, onTimer);
    return () => {
      window.removeEventListener(CRUXY_LIVE_EVENT, onCruxy);
      window.removeEventListener(TIMER_LIVE_EVENT, onTimer);
    };
  }, []);

  return (
    <>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {polite}
      </div>
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {assertive}
      </div>
    </>
  );
}

export function announceCruxy(message: string, assertive = false) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CRUXY_LIVE_EVENT, {
      detail: { message, assertive },
    }),
  );
}

export function announceTimer(message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(TIMER_LIVE_EVENT, {
      detail: { message, assertive: true },
    }),
  );
}

export function publishSpeechCaption(text: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(SPEECH_CAPTION_EVENT, { detail: { text } }),
  );
}
