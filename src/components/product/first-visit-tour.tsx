"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { GeniePose } from "@/components/cruxy/mood/genie-pose";
import { usePrefersReducedMotion } from "@/components/motion/reduced-motion";

const STORAGE_KEY = "crux-first-visit-tour-v1";

const STEPS = [
  {
    title: "Start on Today",
    body: "Three things to do. New to Ethics Bowl? Read it in 90 seconds first.",
    href: "/today",
    cta: "Open Today",
    secondaryHref: "/help/ethics-bowl",
    secondaryCta: "90 seconds",
  },
  {
    title: "Open your case",
    body: "Evidence Library and Team Brief live on the case page.",
    href: "/case-brain",
    cta: "See cases",
  },
  {
    title: "Drill once",
    body: "Judges' Q&A in one tap. Ten minutes is enough.",
    href: "/practice/drills/judges-qa",
    cta: "Start drill",
  },
] as const;

/**
 * Cruxy first-visit tour. Three steps max. localStorage only (no migration).
 */
export function FirstVisitTour() {
  const pathname = usePathname();
  const reduced = usePrefersReducedMotion();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (pathname.startsWith("/consent") || pathname.startsWith("/choose")) {
      return;
    }
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") return;
      setOpen(true);
    } catch {
      // ignore
    }
  }, [pathname]);

  function finish() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    setOpen(false);
  }

  function next() {
    if (step >= STEPS.length - 1) {
      finish();
      return;
    }
    setStep((s) => s + 1);
  }

  if (!open) return null;
  const current = STEPS[step]!;

  return (
    <div
      className="fixed inset-x-3 bottom-[96px] z-[55] mx-auto max-w-md sm:bottom-8 sm:right-6 sm:left-auto sm:mx-0"
      role="dialog"
      aria-label="Welcome to Crux"
    >
      <div
        className={
          reduced
            ? "flex gap-3 rounded-[20px] border-2 border-ink bg-white p-4 shadow-[0_12px_40px_rgba(17,19,24,0.18)]"
            : "flex gap-3 rounded-[20px] border-2 border-ink bg-white p-4 shadow-[0_12px_40px_rgba(17,19,24,0.18)] animate-fade-up"
        }
      >
        <GeniePose pose="curious" width={56} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
            Cruxy, step {step + 1} of {STEPS.length}
          </p>
          <p className="mt-1 font-display text-lg font-extrabold leading-tight">
            {current.title}
          </p>
          <p className="mt-1 text-sm text-muted">{current.body}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={current.href}
              onClick={() => {
                if (step >= STEPS.length - 1) finish();
                else setStep((s) => s + 1);
              }}
              className="inline-flex h-9 items-center rounded-lg bg-ink px-3 text-xs font-semibold text-white"
            >
              {current.cta}
            </Link>
            {"secondaryHref" in current && current.secondaryHref ? (
              <Link
                href={current.secondaryHref}
                onClick={() => setStep((s) => Math.min(s + 1, STEPS.length - 1))}
                className="inline-flex h-9 items-center rounded-lg border border-ink/15 px-3 text-xs font-semibold text-ink"
              >
                {current.secondaryCta}
              </Link>
            ) : null}
            <button
              type="button"
              className="h-9 rounded-lg px-3 text-xs font-semibold text-muted underline"
              onClick={next}
            >
              {step >= STEPS.length - 1 ? "Done" : "Next"}
            </button>
            <button
              type="button"
              className="h-9 rounded-lg px-2 text-xs text-muted"
              onClick={finish}
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
