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
  // Off-screen until placed on mount, so it never flashes over the sidebar.
  const [pos, setPos] = useState<Pos>({ x: -9999, y: -9999 });
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
    // While the Genie is out the lamp is tucked; do not drag or wake again.
    if (awake && lampMotion !== "swirl") return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      ox: e.clientX - pos.x,
      oy: e.clientY - pos.y,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    setPos(
      clampLamp(
        { x: e.clientX - d.ox, y: e.clientY - d.oy },
        window.innerWidth,
        window.innerHeight,
      ),
    );
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (!d) return;
    if (!d.moved) {
      if (awake) sleep();
      else wake();
      return;
    }
    const snapped = snapLamp(posRef.current, window.innerWidth, window.innerHeight);
    setPos(snapped);
    saveLampPos(snapped);
  };

  const resting = !awake && lampMotion !== "pop";
  // Wave 8 J: while Genie is out, tuck the lamp so there are never two big figures.
  // Keep it in the DOM (for rise-from-lamp placement and drop-to-sleep), but hidden.
  // Stay visible only while swirling home so the Genie can settle into the lamp.
  const tucked = awake && lampMotion !== "swirl";

  return (
    <div
      className={cn(
        "fixed z-30 touch-none select-none",
        dragging && "cursor-grabbing",
        // Instant tuck when Genie is out so a second figure never lingers.
        tucked && "pointer-events-none opacity-0 scale-50",
        !tucked && "opacity-100 scale-100 transition-[opacity,transform] duration-300",
      )}
      style={{ left: pos.x, top: pos.y, width: LAMP_W }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      aria-hidden={tucked}
    >
      <div
        id="cruxy-lamp"
        role="button"
        tabIndex={tucked ? -1 : 0}
        aria-label={awake ? "Send Cruxy to the lamp" : "Call Cruxy"}
        title={awake ? "Tap to send Cruxy to sleep" : "Tap to call Cruxy"}
        onKeyDown={(e) => {
          if (tucked) return;
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
          {/* Pop rise is the floating Genie at figure size; no second Genie on the lamp. */}

          <Image
            src="/cruxy/cruxy-lamp.png"
            alt=""
            width={120}
            height={88}
            className={cn(
              "relative z-0 h-auto w-[120px] drop-shadow-[0_6px_10px_rgba(17,19,24,0.25)]",
              lampMotion === "pop" && "scale-105 transition-transform",
              !dragging && !tucked && "cursor-grab",
            )}
            draggable={false}
            unoptimized
          />
        </div>

        {/* Hint in its own opaque pill so table chips stay readable underneath. */}
        {!tucked ? (
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
        ) : null}
      </div>
    </div>
  );
}

export { LAMP_POS_KEY, loadLampPos, clampLamp, defaultLampPos };
