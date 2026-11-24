"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  findFrameworkHits,
  type FrameworkEntry,
} from "@/lib/frameworks/catalog";
import { cleanReaderText } from "@/lib/text/reader-text";
import { cn } from "@/lib/utils";
import {
  closeHoverCard,
  getActiveHoverCardId,
  openHoverCard,
  placeHoverCard,
  subscribeHoverCard,
} from "@/components/frameworks/hover-card-store";

type ApplyPayload = {
  term: string;
  explanation: string;
  sourceUrl: string;
  sourceLabel: "SEP" | "IEP";
  apply: string | null;
  citationIds: string[];
};

type Props = {
  text: string;
  /** When set, the card can load a cited "how it applies" line. */
  caseId?: string | null;
  className?: string;
  /** Preserve whitespace (working doc / suggestions). */
  preWrap?: boolean;
};

const LEAVE_MS = 180;
const CARD_W = 280;
const CARD_H_EST = 200;

/**
 * Quiet in-place framework links: first hit of each term per paragraph only.
 * Hover or tap for plain meaning, case apply (cited), and encyclopedia link.
 * Only one hover card is open anywhere on the page.
 */
export function LinkedText({ text: raw, caseId, className, preWrap }: Props) {
  // Stored AI text may still carry ids or markdown from before the clean-up.
  const text = cleanReaderText(raw ?? "");
  // Split on blank lines so each paragraph gets its own first-hit pass.
  const parts = text.split(/(\n+)/);
  const hasAny = parts.some(
    (p) => p.length > 0 && !/^\n+$/.test(p) && findFrameworkHits(p).length > 0,
  );
  if (!hasAny) {
    return (
      <span className={cn(preWrap && "whitespace-pre-wrap", className)}>
        {text}
      </span>
    );
  }

  let key = 0;
  const nodes: ReactNode[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (/^\n+$/.test(part)) {
      nodes.push(<span key={`n-${key++}`}>{part}</span>);
      continue;
    }
    const hits = findFrameworkHits(part);
    if (!hits.length) {
      nodes.push(<span key={`t-${key++}`}>{part}</span>);
      continue;
    }
    let cursor = 0;
    for (const h of hits) {
      if (h.from < cursor) continue;
      if (h.from > cursor) {
        nodes.push(
          <span key={`t-${key++}`}>{part.slice(cursor, h.from)}</span>,
        );
      }
      nodes.push(
        <FrameworkMark
          key={`f-${key++}`}
          entry={h.entry}
          label={part.slice(h.from, h.to)}
          caseId={caseId}
        />,
      );
      cursor = h.to;
    }
    if (cursor < part.length) {
      nodes.push(<span key={`t-${key++}`}>{part.slice(cursor)}</span>);
    }
  }

  return (
    <span className={cn(preWrap && "whitespace-pre-wrap", "break-words", className)}>
      {nodes}
    </span>
  );
}

function FrameworkMark({
  entry,
  label,
  caseId,
}: {
  entry: FrameworkEntry;
  label: string;
  caseId?: string | null;
}) {
  const tipId = useId();
  const cardKey = `fw:${tipId}`;
  const activeId = useSyncExternalStore(
    subscribeHoverCard,
    getActiveHoverCardId,
    () => null,
  );
  const open = activeId === cardKey;
  const [payload, setPayload] = useState<ApplyPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const cardRef = useRef<HTMLSpanElement | null>(null);
  const leaveTimer = useRef<number | null>(null);
  // Focus opens the card; the click that follows focus must not toggle it shut.
  const skipClickToggle = useRef(false);

  const clearLeave = useCallback(() => {
    if (leaveTimer.current != null) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearLeave();
    leaveTimer.current = window.setTimeout(() => {
      closeHoverCard(cardKey);
    }, LEAVE_MS);
  }, [cardKey, clearLeave]);

  const show = useCallback(() => {
    clearLeave();
    openHoverCard(cardKey);
  }, [cardKey, clearLeave]);

  const load = useCallback(async () => {
    if (payload || busy) return;
    setBusy(true);
    try {
      const q = new URLSearchParams({ termId: entry.id });
      if (caseId) q.set("caseId", caseId);
      const res = await fetch(`/api/frameworks/apply?${q.toString()}`);
      if (!res.ok) {
        setPayload({
          term: entry.term,
          explanation: entry.explanation,
          sourceUrl: entry.sourceUrl,
          sourceLabel: entry.sourceLabel,
          apply: null,
          citationIds: [],
        });
        return;
      }
      const data = (await res.json()) as ApplyPayload;
      setPayload(data);
    } catch {
      setPayload({
        term: entry.term,
        explanation: entry.explanation,
        sourceUrl: entry.sourceUrl,
        sourceLabel: entry.sourceLabel,
        apply: null,
        citationIds: [],
      });
    } finally {
      setBusy(false);
    }
  }, [busy, caseId, entry, payload]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) {
      setPos(null);
      return;
    }
    const anchor = wrapRef.current.getBoundingClientRect();
    const measured = cardRef.current?.getBoundingClientRect();
    const h = measured?.height ?? CARD_H_EST;
    const w = measured?.width ?? CARD_W;
    setPos(placeHoverCard(anchor, w, h));
  }, [open, payload, busy]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || cardRef.current?.contains(t)) return;
      closeHoverCard(cardKey);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeHoverCard(cardKey);
    }
    function onScroll() {
      if (!wrapRef.current) return;
      const anchor = wrapRef.current.getBoundingClientRect();
      const measured = cardRef.current?.getBoundingClientRect();
      const h = measured?.height ?? CARD_H_EST;
      const w = measured?.width ?? CARD_W;
      setPos(placeHoverCard(anchor, w, h));
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, cardKey]);

  useEffect(() => () => clearLeave(), [clearLeave]);

  return (
    <span
      ref={wrapRef}
      className="relative inline"
      onMouseEnter={show}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        data-framework-mark
        className="border-b border-dotted border-ink/35 bg-transparent p-0 font-inherit text-inherit underline-offset-2 hover:border-cardinal/70"
        style={{ font: "inherit" }}
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        onFocus={() => {
          skipClickToggle.current = true;
          show();
        }}
        onBlur={scheduleClose}
        onClick={(e) => {
          e.stopPropagation();
          if (skipClickToggle.current) {
            skipClickToggle.current = false;
            show();
            return;
          }
          if (open) closeHoverCard(cardKey);
          else show();
        }}
      >
        {label}
      </button>
      {open ? (
        <span
          ref={cardRef}
          id={tipId}
          role="tooltip"
          data-hover-card
          className="fixed z-[70] w-[min(280px,calc(100vw-32px))] rounded-xl border border-ink/10 bg-white p-3 text-left shadow-[0_10px_28px_rgba(17,19,24,0.14)]"
          style={
            pos
              ? { left: pos.left, top: pos.top }
              : { left: -9999, top: -9999, visibility: "hidden" }
          }
          onMouseEnter={show}
          onMouseLeave={scheduleClose}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <strong className="font-display block text-sm font-extrabold text-ink">
            {payload?.term ?? entry.term}
          </strong>
          <span className="mt-1 block text-xs leading-snug text-ink">
            {payload?.explanation ?? entry.explanation}
          </span>
          {busy && !payload?.apply ? (
            <span className="mt-2 block text-xs text-muted">
              Checking how this fits the case…
            </span>
          ) : null}
          {payload?.apply ? (
            <span className="mt-2 block text-xs leading-snug text-ink">
              <span className="font-semibold">On this case: </span>
              {payload.apply}
            </span>
          ) : caseId && payload && !busy ? (
            <span className="mt-2 block text-xs text-muted">
              Cruxy needs a cited line before it can say how this fits here.
            </span>
          ) : null}
          <a
            href={payload?.sourceUrl ?? entry.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold text-cardinal underline-offset-2 hover:underline"
          >
            Read more ({payload?.sourceLabel ?? entry.sourceLabel})
          </a>
        </span>
      ) : null}
    </span>
  );
}
