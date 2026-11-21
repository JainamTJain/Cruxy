"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCruxy, type CruxyMood } from "@/components/cruxy/cruxy-context";
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

const POS_KEY = "cruxy-float-pos";
const FIGURE = 150; // width, as in Cruxy.html
const FIGURE_PHONE = 96;
/** Genie images are about twice as tall as wide. */
const ASPECT = 2;
/** Height kept clear for the phone tab bar. */
const TAB_BAR = 88;

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
  localStorage.setItem(POS_KEY, JSON.stringify(pos));
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
  const nx = x < midX ? 12 : w - size - 12;
  return { x: nx, y: Math.min(Math.max(12, y), h - size * ASPECT - TAB_BAR) };
}

/** Keep the figure fully on screen (and above the phone tab bar). */
function clampToViewport(p: Pos, w: number, h: number): Pos {
  const size = figureFor(w);
  const bottom = w < 640 ? TAB_BAR : 24;
  return {
    x: Math.min(Math.max(8, p.x), w - size - 8),
    y: Math.min(Math.max(8, p.y), h - size * ASPECT - bottom),
  };
}

export function FloatingCruxy() {
  const {
    awake,
    mood,
    hideFigure,
    recordingOrTimed,
    bubble,
    setDrawerOpen,
    sleep,
    setBubble,
  } = useCruxy();
  const [pos, setPos] = useState<Pos>({ x: 24, y: 120 });
  const [dragging, setDragging] = useState(false);
  const [vw, setVw] = useState(1440);
  const dragRef = useRef<{ ox: number; oy: number } | null>(null);
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const saved = loadPos();
    const size = figureFor(w);
    const start = saved ?? {
      x: w - size - (w < 640 ? 12 : 24),
      y: h - size * ASPECT - (w < 640 ? TAB_BAR + 12 : 110),
    };
    setPos(clampToViewport(start, w, h));
    const onResize = () => {
      setVw(window.innerWidth);
      setPos((p) => clampToViewport(p, window.innerWidth, window.innerHeight));
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { ox: e.clientX - pos.x, oy: e.clientY - pos.y };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setPos({
      x: e.clientX - dragRef.current.ox,
      y: e.clientY - dragRef.current.oy,
    });
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

  if (!awake || hideFigure || recordingOrTimed) return null;

  const phone = vw < 640;
  const size = figureFor(vw);
  // Flip bubble to the left when near the right edge (Cruxy.html flip)
  const flipLeft = !phone && pos.x + size / 2 > vw * 0.55;

  return (
    <div
      className="fixed z-40 touch-none"
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
                  // Pin to the viewport's 16px gutters, not the figure
                  left: 16 - pos.x,
                  width: "calc(100vw - 32px)",
                }
              : undefined
          }
        >
          {bubble}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-gold/30 px-2 py-1 text-[11px] font-medium"
              onClick={(e) => {
                e.stopPropagation();
                setBubble(
                  "Here's one hint: try restating the claim in one sentence.",
                );
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
          if (!dragging) setDrawerOpen(true);
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
