"use client";

import { cn } from "@/lib/utils";

type Props = {
  /** Remount key when the active tab changes. */
  tabKey: string;
  children: React.ReactNode;
  className?: string;
};

/** Smooth fade when switching tabs / panels. */
export function TabFade({ tabKey, children, className }: Props) {
  return (
    <div key={tabKey} className={cn("motion-tab-fade", className)}>
      {children}
    </div>
  );
}
