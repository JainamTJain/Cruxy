"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { GeniePose } from "@/components/cruxy/mood/genie-pose";
import { usePrefersReducedMotion } from "@/components/motion/reduced-motion";

/** Fired by "Take the tour" links anywhere in the app. */
export const START_TOUR_EVENT = "crux:start-tour";
const DONE_KEY = "crux-guided-tour-v2";

type Step = {
  /** CSS selector of the thing to point at. Null means a centred card. */
  target: string | null;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    target: null,
    title: "Welcome to Crux",
    body: "I'm Cruxy. This takes under a minute and shows you where everything lives. You can leave any time with Skip or Esc.",
  },
  {
    target: '[data-tour="nav-today"]',
    title: "Today",
    body: "Start here every day. Three things to do, picked for you and your team.",
  },
  {
    target: '[data-tour="nav-cases"]',
    title: "Cases",
    body: "Each case has a Reading tab, your team's Working document and a One pager that follows it. My suggestions sit on the right: tick to keep, cross to drop.",
  },
  {
    target: '[data-tour="nav-practice"]',
    title: "Practice",
    body: "Run practice rounds and short drills like Judges' Q&A. Ten minutes is enough to get better.",
  },
  {
    target: '[data-tour="nav-program-map"]',
    title: "Program map",
    body: "The whole season at a glance: dates, cases and rounds up to the regional.",
  },
  {
    target: '[data-tour="nav-my-roadmap"]',
    title: "My roadmap",
    body: "Your own plan. Progress is measured against your own past, never against anyone else.",
  },
  {
    target: '[data-tour="nav-team-chat"], [data-tour="nav-team"]',
    title: "Your team",
    body: "Talk with your team. Other teams never see your work.",
  },
  {
    target: '[data-tour="search"]',
    title: "Search",
    body: "Find any case, note or source. Press Cmd K or Ctrl K from anywhere.",
  },
  {
    target: '#cruxy-lamp, [data-tour="cruxy"]',
    title: "Call me",
    body: "Tap the lamp and ask me anything. I'll usually ask you a question back first, so the thinking stays yours.",
  },
  {
    target: '[data-tour="profile"]',
    title: "You",
    body: "Settings, Help and this tour again live here.",
  },
  {
    target: null,
    title: "You're set",
    body: "Start with Today. If you get lost, open Help or take the tour again from your name.",
  },
];

function visible(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const st = window.getComputedStyle(el);
  return st.visibility !== "hidden" && st.display !== "none" && Number(st.opacity) > 0.05;
}

function findTarget(selector: string | null): HTMLElement | null {
  if (!selector) return null;
  for (const el of document.querySelectorAll(selector)) {
    if (visible(el)) return el;
  }
  return null;
}

type Box = { top: number; left: number; width: number; height: number };

const CARD_W = 340;
const PAD = 8;

function placeCard(box: Box | null, cardH: number): React.CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(CARD_W, vw - 24);
  if (!box) {
    return { width: w, left: (vw - w) / 2, top: Math.max(16, (vh - cardH) / 2) };
  }
  const clampTop = (t: number) => Math.min(Math.max(12, t), vh - cardH - 12);
  const clampLeft = (l: number) => Math.min(Math.max(12, l), vw - w - 12);
  const right = vw - (box.left + box.width);
  const below = vh - (box.top + box.height);
  if (right >= w + 28) {
    return { width: w, left: box.left + box.width + 16, top: clampTop(box.top - 12) };
  }
  if (box.left >= w + 28) {
    return { width: w, left: box.left - w - 16, top: clampTop(box.top - 12) };
  }
  if (box.top >= cardH + 28) {
    return { width: w, left: clampLeft(box.left + box.width / 2 - w / 2), top: box.top - cardH - 16 };
  }
  if (below >= cardH + 28) {
    return { width: w, left: clampLeft(box.left + box.width / 2 - w / 2), top: box.top + box.height + 16 };
  }
  return { width: w, left: (vw - w) / 2, top: 16 };
}

/**
 * Spotlight tour shown the first time someone signs in. Each step dims the
 * page, lights up one part of the app and explains it. Finishing or skipping
 * is stored on the server, so it shows once per person, on any device.
 */
export function GuidedTour() {
  const pathname = usePathname();
  const router = useRouter();
  const reduced = usePrefersReducedMotion();
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<Step[]>(STEPS);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [cardH, setCardH] = useState(220);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const checked = useRef(false);

  const begin = useCallback(() => {
    // Only steps whose target is on screen now (desktop and phone differ).
    const usable = STEPS.filter((s) => s.target === null || findTarget(s.target));
    setSteps(usable);
    setIndex(0);
    setOpen(true);
  }, []);

  // First sign-in: ask the server once whether this person has seen it.
  useEffect(() => {
    if (checked.current) return;
    if (/^\/(consent|choose|signin|sign-in|login)/.test(pathname)) return;
    checked.current = true;
    try {
      if (localStorage.getItem(DONE_KEY) === "1") return;
    } catch {
      // ignore
    }
    let cancelled = false;
    void fetch("/api/product/tour", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { seen?: boolean } | null) => {
        if (cancelled || !j) return;
        if (j.seen) {
          try {
            localStorage.setItem(DONE_KEY, "1");
          } catch {
            // ignore
          }
          return;
        }
        // Let the shell finish laying out before measuring.
        window.setTimeout(begin, 900);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pathname, begin]);

  // "Take the tour" from the menu or Help.
  useEffect(() => {
    const onStart = () => begin();
    window.addEventListener(START_TOUR_EVENT, onStart);
    return () => window.removeEventListener(START_TOUR_EVENT, onStart);
  }, [begin]);

  const step = steps[index];

  const measure = useCallback(() => {
    if (!step) return;
    const el = findTarget(step.target);
    if (!el) {
      setBox(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
  }, [step]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = step ? findTarget(step.target) : null;
    el?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
    measure();
    const t = window.setTimeout(measure, 350);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, step, measure, reduced]);

  useLayoutEffect(() => {
    if (!open) return;
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
    nextRef.current?.focus({ preventScroll: true });
  }, [open, index, box]);

  const close = useCallback(
    (outcome: "finished" | "skipped") => {
      setOpen(false);
      try {
        localStorage.setItem(DONE_KEY, "1");
      } catch {
        // ignore
      }
      void fetch("/api/product/tour", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outcome, step: index + 1, of: steps.length }),
      }).catch(() => undefined);
    },
    [index, steps.length],
  );

  const next = useCallback(() => {
    if (index >= steps.length - 1) {
      close("finished");
      if (pathname !== "/today") router.push("/today");
      return;
    }
    setIndex((i) => i + 1);
  }, [index, steps.length, close, pathname, router]);

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close("skipped");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, back, close]);

  if (!open || !step) return null;
  const last = index >= steps.length - 1;
  const cardStyle = typeof window === "undefined" ? {} : placeCard(box, cardH);
  const ease = reduced ? "" : "transition-all duration-300 ease-out";

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {/* Dimmed page with a lit window around the current target. Clicks on
          the dimmed area do nothing, so the tour never navigates by accident. */}
      {box ? (
        <div
          aria-hidden
          className={`pointer-events-none fixed rounded-2xl ${ease}`}
          style={{
            outline: "3px solid var(--crux-gold, #F5B700)",
            outlineOffset: 2,
            top: box.top,
            left: box.left,
            width: box.width,
            height: box.height,
            boxShadow: "0 0 0 9999px rgba(17,19,24,0.62), 0 0 24px 4px rgba(245,183,0,0.45)",
          }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 bg-[rgba(17,19,24,0.62)]" />
      )}
      <div className="fixed inset-0" onClick={(e) => e.stopPropagation()} />

      <div
        ref={cardRef}
        className={`fixed rounded-[20px] border-2 border-ink bg-white p-4 text-ink shadow-[0_16px_48px_rgba(17,19,24,0.3)] ${ease}`}
        style={cardStyle}
      >
        <div className="flex gap-3">
          <GeniePose pose={last ? "excited" : index === 0 ? "happy" : "curious"} width={52} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
              Tour, {index + 1} of {steps.length}
            </p>
            <h2 id="tour-title" className="mt-1 font-display text-lg font-extrabold leading-tight">
              {step.title}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-[#3B404A]">{step.body}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5" aria-hidden>
          {steps.map((s, i) => (
            <span
              key={s.title}
              className={`h-1.5 rounded-full ${i === index ? "w-5 bg-cardinal" : "w-1.5 bg-mist"}`}
            />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            className="h-9 rounded-lg px-2 text-xs font-semibold text-muted underline"
            onClick={() => close("skipped")}
          >
            Skip tour
          </button>
          <span className="flex-1" />
          {index > 0 ? (
            <button
              type="button"
              className="h-9 rounded-lg border border-ink/15 px-3 text-xs font-semibold"
              onClick={back}
            >
              Back
            </button>
          ) : null}
          <button
            ref={nextRef}
            type="button"
            className="h-9 rounded-lg bg-ink px-4 text-xs font-semibold text-white"
            onClick={next}
          >
            {index === 0 ? "Show me around" : last ? "Go to Today" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Opens the tour from anywhere (menu item, Help page). */
export function startGuidedTour() {
  window.dispatchEvent(new Event(START_TOUR_EVENT));
}
