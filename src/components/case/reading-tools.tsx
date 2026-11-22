"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useCruxy } from "@/components/cruxy/cruxy-context";
import { LinkedText } from "@/components/frameworks/linked-text";
import {
  colorForPerson,
  formatWhen,
  type HighlightSwatch,
} from "@/lib/case/highlight-colors";
import { cn } from "@/lib/utils";

const HIGHLIGHTER_KEY = "crux-highlighter-on";

export type ReadingMark = {
  id: string;
  needle: string;
  kind: "highlight" | "comment";
  personKey: string | null;
  personName: string | null;
  createdAt: string | null;
};

type MenuState = {
  text: string;
  passageId: string;
  x: number;
  y: number;
};

type ExplainState = {
  term: string;
  x: number;
  y: number;
  meaning: string | null;
  source: string | null;
  sourceUrl: string | null;
  apply: string | null;
  busy: boolean;
  error: string | null;
};

type CommentState = {
  text: string;
  passageId: string;
  draft: string;
  busy: boolean;
  status: string | null;
};

type ToolsCtx = {
  highlighterOn: boolean;
  setHighlighterOn: (v: boolean) => void;
  caseId: string | null;
  teamId: string | null;
};

const ReadingToolsContext = createContext<ToolsCtx | null>(null);

export function useReadingTools() {
  const ctx = useContext(ReadingToolsContext);
  if (!ctx) {
    throw new Error("useReadingTools outside ReadingToolsProvider");
  }
  return ctx;
}

export function ReadingToolsProvider({
  caseId,
  teamId,
  children,
}: {
  caseId?: string | null;
  teamId?: string | null;
  children: ReactNode;
}) {
  const [highlighterOn, setHighlighterOnState] = useState(false);

  useEffect(() => {
    try {
      setHighlighterOnState(localStorage.getItem(HIGHLIGHTER_KEY) === "1");
    } catch {
      // ignore
    }
  }, []);

  const setHighlighterOn = useCallback((v: boolean) => {
    setHighlighterOnState(v);
    try {
      localStorage.setItem(HIGHLIGHTER_KEY, v ? "1" : "0");
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(
    () => ({
      highlighterOn,
      setHighlighterOn,
      caseId: caseId ?? null,
      teamId: teamId ?? null,
    }),
    [highlighterOn, setHighlighterOn, caseId, teamId],
  );

  return (
    <ReadingToolsContext.Provider value={value}>
      {children}
    </ReadingToolsContext.Provider>
  );
}

/** Small reading toolbar: Highlighter toggle + hint. */
export function ReadingToolbar({
  className,
  legend,
}: {
  className?: string;
  legend?: { key: string; name: string; swatch: HighlightSwatch }[];
}) {
  const { highlighterOn, setHighlighterOn } = useReadingTools();
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl border border-ink/10 bg-white px-3 py-2",
        className,
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={highlighterOn}
        onClick={() => setHighlighterOn(!highlighterOn)}
        className={cn(
          "inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition",
          highlighterOn
            ? "bg-[#FFE58A] text-ink ring-2 ring-[#E6C200]/60"
            : "border border-ink/15 bg-white text-ink hover:bg-mist/40",
        )}
      >
        <span
          className={cn(
            "inline-block h-2.5 w-2.5 rounded-full",
            highlighterOn ? "bg-[#E6C200]" : "bg-ink/25",
          )}
          aria-hidden
        />
        Highlighter {highlighterOn ? "on" : "off"}
      </button>
      <p className="m-0 text-xs text-muted">
        {highlighterOn
          ? "Select text to highlight it. Right click or long press for more."
          : "Selecting does nothing extra. Right click or long press for Highlight, Comment, Explain this, Ask Cruxy."}
      </p>
      {legend && legend.length > 0 ? (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0 sm:ml-auto">
          {legend.map((row) => (
            <li
              key={row.key}
              className="inline-flex items-center gap-1.5 text-[11px] text-ink"
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm border"
                style={{
                  background: row.swatch.bg,
                  borderColor: row.swatch.border,
                }}
                aria-hidden
              />
              {row.name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function buildLegend(marks: ReadingMark[]) {
  const seen = new Map<string, { key: string; name: string; swatch: HighlightSwatch }>();
  for (const m of marks) {
    if (m.kind !== "highlight") continue;
    const key = m.personKey || m.personName || "someone";
    if (seen.has(key)) continue;
    seen.set(key, {
      key,
      name: m.personName || "Someone",
      swatch: colorForPerson(key),
    });
  }
  return [...seen.values()];
}

/** Render passage text with coloured highlights (never covered by popups). */
export function renderMarkedText(
  text: string,
  marks: ReadingMark[],
  caseId?: string | null,
): ReactNode {
  const hits: {
    from: number;
    to: number;
    mark: ReadingMark;
  }[] = [];
  for (const m of marks) {
    const needle = m.needle.trim();
    if (needle.length < 3) continue;
    const idx = text.indexOf(needle);
    if (idx >= 0) hits.push({ from: idx, to: idx + needle.length, mark: m });
  }
  hits.sort((a, b) => a.from - b.from);
  if (!hits.length) {
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
    const swatch = colorForPerson(h.mark.personKey || h.mark.personName);
    const who = h.mark.personName || "Someone";
    const when = h.mark.createdAt ? formatWhen(h.mark.createdAt) : "";
    const tip = [who, when].filter(Boolean).join(" · ");
    if (h.mark.kind === "highlight") {
      nodes.push(
        <mark
          key={key++}
          title={tip}
          className="rounded-[3px] px-0.5"
          style={{
            backgroundColor: swatch.bg,
            boxShadow: `inset 0 -2px 0 ${swatch.border}`,
          }}
        >
          <LinkedText text={slice} caseId={caseId} />
        </mark>,
      );
    } else {
      nodes.push(
        <span
          key={key++}
          title={tip}
          className="border-b-2 border-[#0F7B6C] bg-[#D8EEEB]/70"
        >
          <LinkedText text={slice} caseId={caseId} />
        </span>,
      );
    }
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

type SurfaceProps = {
  children: ReactNode;
  /** Resolve the passage id for a selection anchor element. */
  resolvePassageId: (el: HTMLElement) => string | null;
  className?: string;
  onSaved?: () => void | Promise<void>;
  /** Override highlight save (e.g. working-doc passages). */
  onHighlight?: (text: string, passageId: string) => Promise<boolean>;
  /** Override comment save. */
  onComment?: (
    text: string,
    passageId: string,
    body: string,
  ) => Promise<boolean>;
};

/**
 * Selection surface: Highlighter-on auto-highlights; right click / long press
 * opens the quiet context menu. Popups never cover the highlight layer.
 */
export function AnnotateSurface({
  children,
  resolvePassageId,
  className,
  onSaved,
  onHighlight,
  onComment,
}: SurfaceProps) {
  const { highlighterOn, caseId, teamId } = useReadingTools();
  const { setHighlight, wake, setBubble } = useCruxy();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [explain, setExplain] = useState<ExplainState | null>(null);
  const [comment, setComment] = useState<CommentState | null>(null);
  const longPress = useRef<{
    timer: number | null;
    x: number;
    y: number;
  }>({ timer: null, x: 0, y: 0 });

  const clearMenu = useCallback(() => setMenu(null), []);

  const readSelection = useCallback((): {
    text: string;
    passageId: string;
    rect: DOMRect;
  } | null => {
    const s = window.getSelection();
    const text = s?.toString().replace(/\s+/g, " ").trim() ?? "";
    if (!s || !text || text.length < 2 || s.rangeCount < 1) return null;
    const node =
      s.anchorNode instanceof Element ? s.anchorNode : s.anchorNode?.parentElement;
    if (!node || !rootRef.current?.contains(node)) return null;
    const passageId = resolvePassageId(node as HTMLElement);
    if (!passageId) return null;
    return {
      text: text.slice(0, 400),
      passageId,
      rect: s.getRangeAt(0).getBoundingClientRect(),
    };
  }, [resolvePassageId]);

  async function saveHighlight(text: string, passageId: string) {
    if (onHighlight) {
      const ok = await onHighlight(text, passageId);
      if (ok) {
        window.getSelection()?.removeAllRanges();
        await onSaved?.();
      }
      return ok;
    }
    const res = await fetch("/api/library/highlights", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passageId, range: text }),
    });
    if (!res.ok) return false;
    window.getSelection()?.removeAllRanges();
    await onSaved?.();
    return true;
  }

  function openMenuAt(x: number, y: number, sel: { text: string; passageId: string }) {
    setExplain(null);
    setComment(null);
    setMenu({
      text: sel.text,
      passageId: sel.passageId,
      x: Math.min(window.innerWidth - 220, Math.max(8, x)),
      y: Math.min(window.innerHeight - 180, Math.max(8, y)),
    });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        clearMenu();
        setExplain(null);
        setComment(null);
      }
    }
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (menu && !(e.target as HTMLElement)?.closest?.("[data-annotate-menu]")) {
        clearMenu();
      }
      if (explain && !(e.target as HTMLElement)?.closest?.("[data-annotate-explain]")) {
        setExplain(null);
      }
      void t;
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [menu, explain, clearMenu]);

  async function runExplain(term: string, x: number, y: number) {
    setExplain({
      term,
      x,
      y,
      meaning: null,
      source: null,
      sourceUrl: null,
      apply: null,
      busy: true,
      error: null,
    });
    try {
      // Frameworks first (when PR #106 / 00070 is live).
      const fw = await fetch("/api/frameworks/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phrase: term, caseId }),
      });
      if (fw.ok) {
        const data = (await fw.json()) as {
          term?: string;
          explanation?: string;
          sourceUrl?: string;
          sourceLabel?: string;
          apply?: string | null;
        };
        setExplain({
          term: data.term ?? term,
          x,
          y,
          meaning: data.explanation ?? null,
          source: data.sourceLabel
            ? `From ${data.sourceLabel}`
            : "Framework card",
          sourceUrl: data.sourceUrl ?? null,
          apply: data.apply ?? null,
          busy: false,
          error: null,
        });
        return;
      }
      const res = await fetch("/api/access/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ term }),
      });
      const data = (await res.json()) as {
        meaning?: string;
        source?: string;
        error?: string;
      };
      if (!res.ok) {
        setExplain((e) =>
          e
            ? {
                ...e,
                busy: false,
                error: data.error ?? "Could not explain that.",
              }
            : e,
        );
        return;
      }
      setExplain({
        term,
        x,
        y,
        meaning: data.meaning ?? null,
        source:
          data.source === "glossary"
            ? "From the Crux glossary"
            : "Plain reading from Cruxy",
        sourceUrl: null,
        apply: null,
        busy: false,
        error: null,
      });
    } catch {
      setExplain((e) =>
        e ? { ...e, busy: false, error: "Network hiccup. Try again." } : e,
      );
    }
  }

  async function saveComment() {
    if (!comment || !comment.draft.trim() || comment.busy) return;
    setComment({ ...comment, busy: true, status: null });
    const range = comment.text;
    const passageId = comment.passageId;
    const body = comment.draft.trim();

    if (onComment) {
      const ok = await onComment(range, passageId, body);
      if (!ok) {
        setComment({
          ...comment,
          busy: false,
          status: "That did not save. Try again.",
        });
        return;
      }
      setComment(null);
      window.getSelection()?.removeAllRanges();
      await onSaved?.();
      return;
    }

    // Prefer E's discussion thread when that API is live.
    let discussionOk = false;
    if (caseId && teamId) {
      try {
        const created = await fetch("/api/discussion/threads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            caseId,
            teamId,
            kind: "annotation",
            targetId: `highlight:${passageId}:${range.slice(0, 48)}`,
            title: range.slice(0, 80),
          }),
        });
        if (created.ok) {
          const json = (await created.json()) as { thread: { id: string } };
          const reply = await fetch(
            `/api/discussion/threads/${json.thread.id}`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ body }),
            },
          );
          discussionOk = reply.ok;
        }
      } catch {
        discussionOk = false;
      }
    }

    if (!discussionOk) {
      const res = await fetch("/api/library/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          passageId,
          range,
          body,
        }),
      });
      if (!res.ok) {
        setComment({
          ...comment,
          busy: false,
          status: "That did not save. Try again.",
        });
        return;
      }
    }

    setComment(null);
    window.getSelection()?.removeAllRanges();
    await onSaved?.();
  }

  return (
    <div
      ref={rootRef}
      data-no-explain
      className={cn("relative", className)}
      onMouseUp={() => {
        if (!highlighterOn) return;
        const sel = readSelection();
        if (!sel || sel.text.length < 3) return;
        void saveHighlight(sel.text, sel.passageId);
      }}
      onContextMenu={(e) => {
        const sel = readSelection();
        if (!sel) return;
        e.preventDefault();
        openMenuAt(e.clientX, e.clientY, sel);
      }}
      onTouchStart={(e) => {
        const t = e.touches[0];
        if (!t) return;
        longPress.current.x = t.clientX;
        longPress.current.y = t.clientY;
        if (longPress.current.timer) window.clearTimeout(longPress.current.timer);
        longPress.current.timer = window.setTimeout(() => {
          const sel = readSelection();
          if (!sel) return;
          openMenuAt(longPress.current.x, longPress.current.y, sel);
        }, 520);
      }}
      onTouchEnd={() => {
        if (longPress.current.timer) {
          window.clearTimeout(longPress.current.timer);
          longPress.current.timer = null;
        }
        if (highlighterOn) {
          window.setTimeout(() => {
            const sel = readSelection();
            if (sel && sel.text.length >= 3) {
              void saveHighlight(sel.text, sel.passageId);
            }
          }, 40);
        }
      }}
      onTouchMove={() => {
        if (longPress.current.timer) {
          window.clearTimeout(longPress.current.timer);
          longPress.current.timer = null;
        }
      }}
    >
      {children}

      {/* Context menu: fixed, so it never covers the highlight in-flow. */}
      {menu ? (
        <div
          data-annotate-menu
          role="menu"
          className="fixed z-[60] w-[200px] rounded-xl border border-ink/10 bg-white p-1.5 shadow-[0_12px_28px_rgba(17,19,24,0.16)]"
          style={{ left: menu.x, top: menu.y }}
        >
          <p className="m-0 truncate px-2 py-1 text-[11px] text-muted">
            “{menu.text.slice(0, 48)}
            {menu.text.length > 48 ? "…" : ""}”
          </p>
          {(
            [
              ["Highlight", "highlight"],
              ["Comment", "comment"],
              ["Explain this", "explain"],
              ["Ask Cruxy", "cruxy"],
            ] as const
          ).map(([label, action]) => (
            <button
              key={action}
              type="button"
              role="menuitem"
              className="flex w-full rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-ink hover:bg-mist/50"
              onClick={() => {
                const snap = menu;
                clearMenu();
                if (action === "highlight") {
                  void saveHighlight(snap.text, snap.passageId);
                } else if (action === "comment") {
                  setComment({
                    text: snap.text,
                    passageId: snap.passageId,
                    draft: "",
                    busy: false,
                    status: null,
                  });
                } else if (action === "explain") {
                  void runExplain(snap.text, snap.x, snap.y);
                } else {
                  setHighlight(snap.text);
                  wake();
                  setBubble(
                    `You selected: “${snap.text.slice(0, 120)}${snap.text.length > 120 ? "…" : ""}”. What do you want to figure out?`,
                  );
                }
              }}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {explain ? (
        <div
          data-annotate-explain
          role="dialog"
          aria-label="Explain this"
          className="fixed z-[60] w-[min(300px,calc(100vw-24px))] rounded-xl border border-ink/10 bg-white p-3 shadow-[0_12px_28px_rgba(17,19,24,0.16)]"
          style={{ left: explain.x, top: explain.y }}
        >
          <strong className="font-display block text-sm font-extrabold">
            {explain.term}
          </strong>
          {explain.busy ? (
            <p className="mt-1 text-xs text-muted">Looking that up…</p>
          ) : null}
          {explain.meaning ? (
            <p className="mt-1 text-xs leading-snug text-ink">{explain.meaning}</p>
          ) : null}
          {explain.apply ? (
            <p className="mt-2 text-xs leading-snug text-ink">
              <span className="font-semibold">On this case: </span>
              {explain.apply}
            </p>
          ) : null}
          {explain.source ? (
            <p className="mt-1 text-[11px] text-muted">{explain.source}</p>
          ) : null}
          {explain.sourceUrl ? (
            <a
              href={explain.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs font-semibold text-cardinal underline-offset-2 hover:underline"
            >
              Read more
            </a>
          ) : null}
          {explain.error ? (
            <p className="mt-1 text-xs text-cardinal" role="alert">
              {explain.error}
            </p>
          ) : null}
          <button
            type="button"
            className="mt-2 text-xs font-semibold text-muted underline"
            onClick={() => setExplain(null)}
          >
            Close
          </button>
        </div>
      ) : null}

      {comment ? (
        <div
          data-annotate-menu
          className="fixed inset-x-3 bottom-24 z-[60] mx-auto w-[min(420px,calc(100vw-24px))] rounded-2xl border border-ink/10 bg-white p-3 shadow-[0_12px_28px_rgba(17,19,24,0.16)] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2"
        >
          <p className="m-0 text-xs font-bold uppercase tracking-[0.08em] text-muted">
            Comment
          </p>
          <p className="mt-1 line-clamp-2 text-xs text-muted">
            On “{comment.text}”
          </p>
          <textarea
            autoFocus
            rows={3}
            className="mt-2 w-full rounded-xl border border-ink/15 px-3 py-2 text-sm"
            placeholder="What should the team remember here?"
            value={comment.draft}
            onChange={(e) =>
              setComment({ ...comment, draft: e.target.value })
            }
          />
          {comment.status ? (
            <p className="mt-1 text-xs text-cardinal">{comment.status}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={comment.busy || !comment.draft.trim()}
              className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              onClick={() => void saveComment()}
            >
              {comment.busy ? "Saving…" : "Post"}
            </button>
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted"
              onClick={() => setComment(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
