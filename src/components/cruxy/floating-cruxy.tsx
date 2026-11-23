"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCruxy } from "@/components/cruxy/cruxy-context";
import { GeniePose } from "@/components/cruxy/mood/genie-pose";
import {
  POSE_ASPECT,
  genieFigureWidth,
} from "@/components/cruxy/mood/poses";
import { usePathname } from "next/navigation";
import { useCruxyMood } from "@/components/cruxy/mood/use-cruxy-mood";
import { usePrefersReducedMotion } from "@/components/motion/reduced-motion";
import { CALL_QUESTION } from "@/lib/cruxy/character";
import { cn } from "@/lib/utils";
import { cleanReaderText } from "@/lib/text/reader-text";

const POS_KEY = "cruxy-float-pos";
const ASPECT = POSE_ASPECT;
const TAB_BAR = 88;
const DRAG_THRESHOLD = 6;

function figureFor(w: number): number {
  return genieFigureWidth(w);
}

type Pos = { x: number; y: number };

function loadPos(): Pos | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(POS_KEY);
    return raw ? (JSON.parse(raw) as Pos) : null;
  } catch {
    return null;
  }
}

function savePos(pos: Pos) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(pos));
  } catch {
    // ignore
  }
  void fetch("/api/prefs/cruxy", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      cruxy_x: pos.x,
      cruxy_y: pos.y,
      cruxy_device: navigator.userAgent.slice(0, 80),
    }),
  });
}

function snapToEdge(x: number, y: number, w: number, h: number): Pos {
  const size = figureFor(w);
  const midX = w / 2;
  const bottom = w < 640 ? TAB_BAR + 12 : 24;
  const nx = x < midX ? 12 : Math.max(12, w - size - 12);
  return {
    x: nx,
    y: Math.min(Math.max(12, y), h - size * ASPECT - bottom),
  };
}

function clampToViewport(p: Pos, w: number, h: number): Pos {
  const size = figureFor(w);
  const bottom = w < 640 ? TAB_BAR + 12 : 24;
  const maxY = h - size * ASPECT - bottom;
  const maxX = w - size - 8;
  return {
    x: Math.min(Math.max(8, p.x), maxX),
    y: Math.min(Math.max(8, p.y), maxY),
  };
}

/** Place the Genie so it rises out of the current lamp position. */
function posFromLamp(w: number, h: number): Pos | null {
  const lamp = document.getElementById("cruxy-lamp");
  if (!lamp) return null;
  const r = lamp.getBoundingClientRect();
  // Not placed yet (still off-screen): fall back to the default corner.
  if (r.right <= 0 || r.bottom <= 0) return null;
  const size = figureFor(w);
  return clampToViewport(
    {
      x: r.left + r.width / 2 - size / 2,
      y: r.top - size * ASPECT * 0.55,
    },
    w,
    h,
  );
}

export function FloatingCruxy() {
  const {
    awake,
    mood,
    hideFigure,
    recordingOrTimed,
    floatMotion,
    bubble,
    setDrawerOpen,
    sleep,
    setBubble,
    emitCruxyEvent,
  } = useCruxy();
  // Wave 7 G: subscribe mood bus (happy/sad/thinking etc.)
  useCruxyMood();
  const [pos, setPos] = useState<Pos>({ x: 24, y: 120 });
  const [dragging, setDragging] = useState(false);
  const [moved, setMoved] = useState(false);
  const [vw, setVw] = useState(1440);
  const [draft, setDraft] = useState("");
  const pathname = usePathname();
  const [asked, setAsked] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [sources, setSources] = useState<number>(0);
  const [plan, setPlan] = useState<{
    planId: string;
    summary: string;
    lines: string[];
  } | null>(null);
  const [planBusy, setPlanBusy] = useState(false);

  /** Send what the person typed to Cruxy, with the page they are on. */
  async function send(text: string) {
    const question = text.trim();
    if (!question || thinking) return;
    setAsked(question);
    setPlan(null);
    setSources(0);
    setThinking(true);
    setBubble("Thinking...");
    emitCruxyEvent("listen.typing");
    const caseMatch = pathname.match(/\/(?:case-brain|team\/cases)\/([0-9a-f-]{36})/);
    try {
      const res = await fetch("/api/cruxy/act", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: question,
          page: pathname,
          caseId: caseMatch?.[1] ?? null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        kind?: "answer" | "plan";
        text?: string;
        citations?: unknown[];
        planId?: string;
        summary?: string;
        lines?: string[];
        error?: string;
      };
      if (!res.ok) {
        setBubble(
          data.error ??
            "I could not reach Cruxy just now. Try again in a moment, or tap Expand.",
        );
        return;
      }
      if (data.kind === "plan" && data.planId) {
        setPlan({
          planId: data.planId,
          summary: data.summary ?? "Here is what I would change.",
          lines: data.lines ?? [],
        });
        setBubble(data.summary ?? "Here is what I would change.");
        return;
      }
      setSources(Array.isArray(data.citations) ? data.citations.length : 0);
      // Mood first: its own line must never replace the answer.
      emitCruxyEvent("feedback.answered_well");
      setBubble(data.text ?? "I do not have an answer for that yet.");
    } catch {
      setBubble("I could not reach Cruxy just now. Try again in a moment.");
    } finally {
      setThinking(false);
    }
  }

  async function applyPlan() {
    if (!plan || planBusy) return;
    setPlanBusy(true);
    try {
      const res = await fetch("/api/cruxy/act/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId: plan.planId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        navigate?: string | null;
        error?: string;
      };
      setPlan(null);
      setBubble(
        res.ok
          ? (data.message ?? "Done. The page now shows the change.")
          : (data.error ?? "That did not go through. Nothing was changed."),
      );
      if (res.ok) {
        window.dispatchEvent(new CustomEvent("crux:data-changed"));
        if (data.navigate) {
          window.location.assign(data.navigate);
        }
      }
    } finally {
      setPlanBusy(false);
    }
  }
  const dragRef = useRef<{ ox: number; oy: number } | null>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const saved = loadPos();
    // Default: bottom right, clear of the sidebar navigation.
    const size = figureFor(w);
    const corner = { x: w - size - 24, y: h - size * ASPECT - 96 };
    setPos(clampToViewport(saved ?? corner, w, h));
    // Rise from the lamp once the lamp has been placed (two frames later);
    // reading it sooner gets its placeholder spot over the sidebar.
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        const fromLamp = posFromLamp(window.innerWidth, window.innerHeight);
        if (fromLamp) setPos(fromLamp);
      });
    });
    const onResize = () => {
      setVw(window.innerWidth);
      setPos((p) => clampToViewport(p, window.innerWidth, window.innerHeight));
    };
    const onPrefsPos = (e: Event) => {
      const detail = (e as CustomEvent<Pos>).detail;
      if (typeof detail?.x === "number" && typeof detail?.y === "number") {
        setPos(clampToViewport(detail, window.innerWidth, window.innerHeight));
        try {
          localStorage.setItem(POS_KEY, JSON.stringify(detail));
        } catch {
          // ignore
        }
      }
    };
    onResize();
    window.addEventListener("resize", onResize);
    window.addEventListener("cruxy-prefs-pos", onPrefsPos);
    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("cruxy-prefs-pos", onPrefsPos);
    };
  }, []);

  // When Cruxy pops out, rise from wherever the lamp currently sits.
  useEffect(() => {
    if (floatMotion !== "enter") return;
    const next = posFromLamp(window.innerWidth, window.innerHeight);
    if (next) {
      setPos(next);
      savePos(next);
    }
  }, [floatMotion]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { ox: e.clientX - pos.x, oy: e.clientY - pos.y };
    setDragging(true);
    setMoved(false);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const next = {
      x: e.clientX - dragRef.current.ox,
      y: e.clientY - dragRef.current.oy,
    };
    const dist =
      Math.abs(next.x - pos.x) + Math.abs(next.y - pos.y);
    if (dist > DRAG_THRESHOLD) setMoved(true);
    setPos(next);
  };

  const onPointerUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    let next = { x: pos.x, y: pos.y };
    const lamp = document.getElementById("cruxy-lamp");
    if (lamp) {
      const r = lamp.getBoundingClientRect();
      const fw = figureFor(window.innerWidth);
      const cx = pos.x + fw / 2;
      const cy = pos.y + fw * ASPECT * 0.75;
      if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) {
        sleep();
        return;
      }
    }
    if (window.innerWidth < 640) {
      next = snapToEdge(next.x, next.y, window.innerWidth, window.innerHeight);
    } else {
      next = clampToViewport(next, window.innerWidth, window.innerHeight);
    }
    setPos(next);
    savePos(next);
  };

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const step = 12;
      const next = { ...pos };
      if (e.key === "ArrowLeft") next.x -= step;
      else if (e.key === "ArrowRight") next.x += step;
      else if (e.key === "ArrowUp") next.y -= step;
      else if (e.key === "ArrowDown") next.y += step;
      else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setBubble(bubble ?? CALL_QUESTION);
        return;
      } else return;
      e.preventDefault();
      setPos(next);
      savePos(next);
    },
    [pos, bubble, setBubble],
  );

  if ((!awake && floatMotion !== "exit") || hideFigure || recordingOrTimed) {
    return null;
  }

  const phone = vw < 640;
  const size = figureFor(vw);
  const flipLeft = !phone && pos.x + size / 2 > vw * 0.55;

  return (
    <div
      className={cn(
        "fixed z-40 touch-none",
        floatMotion === "enter" && "animate-float-pop-in",
        floatMotion === "exit" && "animate-float-swirl-out",
      )}
      style={{ left: pos.x, top: pos.y, width: size }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {bubble ? (
        <div
          className={cn(
            "absolute z-10 rounded-[18px] border-2 border-ink bg-white p-4 text-xs shadow-[0_10px_30px_rgba(17,19,24,0.14)]",
            phone
              ? "bottom-full mb-2 max-w-none"
              : flipLeft
                ? "left-auto right-full top-2 mr-3 w-[340px]"
                : "left-full top-2 ml-3 w-[340px]",
          )}
          style={
            phone
              ? {
                  left: 16 - pos.x,
                  width: "calc(100vw - 32px)",
                }
              : undefined
          }
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="text-[11px] font-semibold text-muted">
              {asked ? `You asked: ${asked.length > 60 ? `${asked.slice(0, 57)}...` : asked}` : "Cruxy"}
            </p>
            <button
              type="button"
              aria-label="Expand Cruxy"
              title="Open the full Cruxy panel"
              className="shrink-0 rounded-md p-0.5 text-muted hover:bg-ink/5 hover:text-ink"
              onClick={(e) => {
                e.stopPropagation();
                setDrawerOpen(true);
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden
              >
                <path
                  d="M9 2h5v5M7 14H2V9M14 2 9.5 6.5M2 14l4.5-4.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
          <p
            className="max-h-[40vh] overflow-y-auto whitespace-pre-wrap text-[13px] leading-snug text-ink"
            aria-live="polite"
          >
            {cleanReaderText(bubble)}
          </p>
          {sources > 0 ? (
            <p className="mt-1 text-[11px] text-muted">
              Based on {sources} source{sources === 1 ? "" : "s"}. Tap Expand to see them.
            </p>
          ) : null}
          {plan ? (
            <div className="mt-3 rounded-lg border border-ink/10 bg-paper p-2">
              {plan.lines.length ? (
                <ul className="m-0 list-none space-y-1 p-0 text-[12px] text-ink">
                  {plan.lines.slice(0, 12).map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                  {plan.lines.length > 12 ? (
                    <li className="text-muted">
                      and {plan.lines.length - 12} more
                    </li>
                  ) : null}
                </ul>
              ) : null}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={planBusy}
                  className="rounded-lg bg-cardinal px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60"
                  onClick={(e) => {
                    e.stopPropagation();
                    void applyPlan();
                  }}
                >
                  {planBusy ? "Applying..." : "Apply"}
                </button>
                <button
                  type="button"
                  className="rounded-lg px-3 py-1.5 text-[12px] text-muted underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPlan(null);
                    setBubble("Okay, nothing changed. Tell me what to do differently.");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const t = draft;
              setDraft("");
              void send(t);
            }}
          >
            <label className="min-w-0 flex-1">
              <span className="sr-only">Ask Cruxy or tell it what to do</span>
              <input
                className="w-full rounded-lg border border-ink/15 bg-paper px-2 py-1.5 text-[13px]"
                placeholder="Ask Cruxy, or tell it what to do here"
                value={draft}
                disabled={thinking}
                onChange={(e) => {
                  setDraft(e.target.value);
                  emitCruxyEvent("listen.typing");
                }}
              />
            </label>
            <button
              type="submit"
              disabled={thinking || !draft.trim()}
              className="rounded-lg bg-ink px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
            >
              {thinking ? "..." : "Send"}
            </button>
          </form>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-[11px] text-muted underline"
              onClick={(e) => {
                e.stopPropagation();
                setAsked(null);
                setPlan(null);
                sleep();
              }}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        aria-label="Cruxy"
        className={cn(
          "flex items-center justify-center bg-transparent p-0",
          !dragging && !reduced && "animate-bob",
        )}
        style={{ width: size }}
        onClick={() => {
          if (!dragging && !moved) {
            setBubble(bubble ? null : CALL_QUESTION);
          }
        }}
        onKeyDown={onKeyDown}
      >
        <GeniePose
          pose={mood}
          width={size}
          imgClassName="drop-shadow-[0_12px_18px_rgba(17,19,24,0.22)]"
        />
      </button>
    </div>
  );
}
