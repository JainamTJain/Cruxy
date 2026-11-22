"use client";

import Link from "next/link";
import type { TodayAction } from "@/lib/product/today";
import { LiftCard } from "@/components/motion/lift-card";

type Props = {
  actions: TodayAction[];
};

/** Three things to do. One stack. No duplicate panels. */
export function TodayFocus({ actions }: Props) {
  if (!actions.length) {
    return (
      <p className="rounded-[20px] bg-ink p-5 text-sm text-[#9AA0AA]">
        Nothing queued. Open your roadmap or start a warm-up.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-[20px] bg-ink p-5 text-white">
      <h2 className="font-display m-0 text-[22px] font-extrabold">
        Your three things
      </h2>
      <p className="m-0 text-xs text-[#9AA0AA]">
        Do these next. Everything else can wait.
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {actions.map((a) => (
          <li key={a.id}>
            <LiftCard className="rounded-xl bg-[#1E2129]">
              <Link
                href={a.href}
                className="flex flex-col gap-1 p-3 text-white"
              >
                <span className="text-xs font-bold text-gold">{a.label}</span>
                <span className="text-[15px] leading-snug">{a.detail}</span>
              </Link>
            </LiftCard>
          </li>
        ))}
      </ul>
    </section>
  );
}
