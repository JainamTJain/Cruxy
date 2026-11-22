"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCruxy, type CruxyMood } from "@/components/cruxy/cruxy-context";
import { HINT_FALLBACK } from "@/lib/cruxy/character";
import { cn } from "@/lib/utils";

const MOOD_SRC: Record<CruxyMood, string> = {
  curious: "/cruxy/cruxy-curious.png",
  neutral: "/cruxy/cruxy-neutral.png",
  winking: "/cruxy/cruxy-winking.png",
  happy: "/cruxy/cruxy-happy.png",
  excited: "/cruxy/cruxy-excited.png",
  surprised: "/cruxy/cruxy-surprised.png",
  sad: "/cruxy/cruxy-sad.png",
  sleepy: "/cruxy/cruxy-sleepy.png",
  angry: "/cruxy/cruxy-angry.png",
};

const MOOD_LABEL: Record<CruxyMood, string> = {
  curious: "curious",
  neutral: "listening",
  winking: "hint",
  happy: "pleased",
  excited: "excited",
  surprised: "surprised",
  sad: "sad",
  sleepy: "sleepy",
  angry: "fierce",
};

const POS_KEY = "cruxy-float-pos";
const FIGURE = 150;
const FIGURE_PHONE = 96;
const ASPECT = 2;
const TAB_BAR = 88;
const DRAG_THRESHOLD = 6;

function figureFor(w: number): number {
  return w < 640 ? FIGURE_PHONE : FIGURE;
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
  const [pos, setPos] = useState<Pos>({ x: 24, y: 120 });
  const [dragging, setDragging] = useState(false);
  const [moved, setMoved] = useState(false);
  const [vw, setVw] = useState(1440);
  const [draft, setDraft] = useState("");
  const dragRef = useRef<{ ox: number; oy: number } | null>(null);
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const fromLamp = posFromLamp(w, h);
    const saved = loadPos();
    const start = fromLamp ?? saved ?? { x: 24, y: 120 };
    setPos(clampToViewport(start, w, h));
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
        setDrawerOpen(true);
        return;
      } else return;
      e.preventDefault();
      setPos(next);
      savePos(next);
    },
    [pos, setDrawerOpen],
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
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {MOOD_LABEL[mood]}
          </p>
          <p className="text-[13px] leading-snug text-ink">{bubble}</p>
          <label className="mt-3 block">
            <span className="sr-only">Your answer</span>
            <input
              className="w-full rounded-lg border border-ink/15 bg-paper px-2 py-1.5 text-[12px]"
              placeholder="Type a short try…"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                emitCruxyEvent("listen.typing");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.trim()) {
                  e.preventDefault();
                  setBubble(null);
                  setDrawerOpen(true);
                  setDraft("");
                  emitCruxyEvent("feedback.answered_well");
                }
              }}
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-gold/30 px-2 py-1 text-[11px] font-medium"
              onClick={(e) => {
                e.stopPropagation();
                emitCruxyEvent("hint.given");
                setBubble(HINT_FALLBACK);
              }}
            >
              One hint, please
            </button>
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-[11px] text-muted underline"
              onClick={(e) => {
                e.stopPropagation();
                sleep();
              }}
            >
              Back to the lamp
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
          if (!dragging && !moved) setDrawerOpen(true);
        }}
        onKeyDown={onKeyDown}
      >
        <Image
          src={MOOD_SRC[mood]}
          alt=""
          width={size}
          height={size * ASPECT}
          className="pointer-events-none block h-auto w-full drop-shadow-[0_12px_18px_rgba(17,19,24,0.22)]"
          draggable={false}
          unoptimized
        />
      </button>
    </div>
  );
}
