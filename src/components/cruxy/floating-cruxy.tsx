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
  const midX = w / 2;
  const nx = x < midX ? 12 : w - 76;
  return { x: nx, y: Math.min(Math.max(12, y), h - 100) };
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
  const dragRef = useRef<{ ox: number; oy: number } | null>(null);
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const saved = loadPos();
    if (saved) setPos(saved);
    else if (typeof window !== "undefined") {
      setPos({ x: window.innerWidth - 88, y: window.innerHeight - 180 });
    }
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
      const cx = pos.x + 28;
      const cy = pos.y + 28;
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

  return (
    <div
      className="fixed z-40 touch-none"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {bubble ? (
        <div className="absolute bottom-full left-1/2 mb-2 w-48 -translate-x-1/2 rounded-2xl border border-ink/10 bg-white/95 px-3 py-2 text-xs shadow-md">
          {bubble}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="rounded-lg bg-gold/30 px-2 py-1 text-[10px] font-medium"
              onClick={(e) => {
                e.stopPropagation();
                setBubble("Here's one hint — try restating the claim in one sentence.");
              }}
            >
              One hint, please
            </button>
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-[10px] text-muted underline"
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
          "flex h-14 w-14 items-center justify-center rounded-full bg-white/80 shadow-lg ring-1 ring-ink/10",
          !dragging && !reduced && "animate-bob",
        )}
        onClick={() => {
          if (!dragging) setDrawerOpen(true);
        }}
        onKeyDown={onKeyDown}
      >
        <Image
          src={MOOD_SRC[mood]}
          alt=""
          width={48}
          height={48}
          draggable={false}
          unoptimized
        />
      </button>
    </div>
  );
}
