"use client";

import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  /** Rounded pill / block / card shape */
  rounded?: "sm" | "md" | "lg" | "full";
};

/** Shimmer placeholder instead of blank space. */
export function Skeleton({ className, rounded = "md" }: Props) {
  const r =
    rounded === "full"
      ? "rounded-full"
      : rounded === "lg"
        ? "rounded-[20px]"
        : rounded === "sm"
          ? "rounded-md"
          : "rounded-[10px]";
  return (
    <div
      className={cn("motion-skeleton", r, className)}
      aria-hidden
    />
  );
}

export function SkeletonBlock({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}
