"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useCruxy } from "@/components/cruxy/cruxy-context";
import { cn } from "@/lib/utils";

const LAMP_POS_KEY = "cruxy-lamp-pos";
const LAMP_W = 120;
/** Image + sleep glyphs + resting pill. */
const LAMP_H = 150;
const TAB_BAR = 88;
const DRAG_THRESHOLD = 6;

type Pos = { x: number; y: number };

function loadLampPos(): Pos | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAMP_POS_KEY);
    return raw ? (JSON.parse(raw) as Pos) : null;
  } catch {
    return null;
  }
}

function saveLampPos(pos: Pos) {
  try {
    localStorage.setItem(LAMP_POS_KEY, JSON.stringify(pos));
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent("cruxy-lamp-pos", { detail: pos }));
}

function clampLamp(p: Pos, w: number, h: number): Pos {
  const bottom = w < 640 ? TAB_BAR + 8 : 16;
  return {
    x: Math.min(Math.max(8, p.x), Math.max(8, w - LAMP_W - 8)),
    y: Math.min(Math.max(8, p.y), Math.max(8, h - LAMP_H - bottom)),
  };
}

function snapLamp(p: Pos, w: number, h: number): Pos {
  const mid = w / 2;
  const x = p.x + LAMP_W / 2 < mid ? 8 : Math.max(8, w - LAMP_W - 8);
  return clampLamp({ x, y: p.y }, w, h);
}

function defaultLampPos(w: number, h: number): Pos {
  const bottom = w < 640 ? TAB_BAR + 8 : 16;
  return clampLamp(
    { x: w - LAMP_W - (w < 640 ? 16 : 20), y: h - LAMP_H - bottom },
    w,
    h,
  );
}

export function CruxyLamp() {
  const { awake, wake, sleep, lampMotion } = useCruxy();
  const [pos, setPos] = useState<Pos>({ x: 24, y: 120 });
  const [dragging, setDragging] = useState(false);
  const posRef = useRef(pos);
  posRef.current = pos;
  const dragRef = useRef<{
    ox: number;
    oy: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const saved = loadLampPos();
    const start = saved
      ? clampLamp(saved, w, h)
      : defaultLampPos(w, h);
    setPos(start);
    window.dispatchEvent(new CustomEvent("cruxy-lamp-pos", { detail: start }));

    const onResize = () => {
      setPos((p) =>
        clampLamp(p, window.innerWidth, window.innerHeight),
      );
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      ox: e.clientX - pos.x,
      oy: e.clientY - pos.y,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    setDragging(false);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (!dragRef.current.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      dragRef.current.moved = true;
      setDragging(true);
    }
    const next = clampLamp(
      {
        x: e.clientX - dragRef.current.ox,
        y: e.clientY - dragRef.current.oy,
      },
      window.innerWidth,
      window.innerHeight,
    );
    setPos(next);
  };

  const onPointerUp = () => {
    if (!dragRef.current) return;
    const wasDrag = dragRef.current.moved;
    dragRef.current = null;
    setDragging(false);
    if (!wasDrag) {
      if (awake) sleep();
      else wake();
      return;
    }
    const snapped = snapLamp(
      posRef.current,
      window.innerWidth,
      window.innerHeight,
    );
    setPos(snapped);
    saveLampPos(snapped);
  };

  const resting = !awake && lampMotion !== "pop";

  return (
    <div
      className={cn(
        "fixed z-30 touch-none select-none",
        dragging && "cursor-grabbing",
      )}
      style={{ left: pos.x, top: pos.y, width: LAMP_W }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        id="cruxy-lamp"
        role="button"
        tabIndex={0}
        aria-label={awake ? "Send Cruxy to the lamp" : "Call Cruxy"}
        title={awake ? "Tap to send Cruxy to sleep" : "Tap to call Cruxy"}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (awake) sleep();
            else wake();
          }
        }}
        className="relative flex w-full flex-col items-center border-0 bg-transparent p-0 outline-none"
      >
        <div className="relative w-full">
          {/* Sleep glyphs sit on the lamp art, never outside this box. */}
          {resting ? (
            <span
              aria-hidden
              className="font-display pointer-events-none absolute left-1/2 top-[6px] z-[2] -translate-x-1/2 rounded-md bg-white/90 px-1.5 text-[15px] font-extrabold tracking-[0.14em] text-genie"
            >
              z z
            </span>
          ) : null}

          {lampMotion === "swirl" ? (
            <span
              aria-hidden
              className="animate-lamp-swirl pointer-events-none absolute left-1/2 top-2 z-[2] h-10 w-10 -translate-x-1/2 rounded-full bg-genie/40 blur-[2px]"
            />
          ) : null}
          {lampMotion === "pop" ? (
            <span
              aria-hidden
              className="animate-lamp-pop pointer-events-none absolute left-1/2 top-0 z-[2] h-12 w-12 -translate-x-1/2"
            >
              <Image
                src="/cruxy/cruxy-curious.png"
                alt=""
                width={48}
                height={96}
                className="h-auto w-full"
                unoptimized
              />
            </span>
          ) : null}

          <Image
            src="/cruxy/cruxy-lamp.png"
            alt=""
            width={120}
            height={88}
            className={cn(
              "relative z-0 h-auto w-[120px] drop-shadow-[0_6px_10px_rgba(17,19,24,0.25)]",
              lampMotion === "pop" && "scale-105 transition-transform",
              !dragging && "cursor-grab",
            )}
            draggable={false}
            unoptimized
          />
        </div>

        {/* Hint in its own opaque pill so table chips stay readable underneath. */}
        <span
          className={cn(
            "mt-1 max-w-[120px] rounded-full px-2.5 py-1 text-center text-[10px] font-medium leading-snug shadow-[0_2px_8px_rgba(17,19,24,0.12)]",
            resting
              ? "bg-white text-ink ring-1 ring-ink/12"
              : "bg-white text-muted ring-1 ring-ink/10",
          )}
        >
          {awake ? "Cruxy's lamp" : "Cruxy is resting. Tap to call."}
        </span>
      </div>
    </div>
  );
}

export { LAMP_POS_KEY, loadLampPos, clampLamp, defaultLampPos };
