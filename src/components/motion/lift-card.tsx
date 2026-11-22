"use client";

import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "article" | "li" | "section";
};

/** Soft lift on hover. Off under prefers-reduced-motion via CSS. */
export function LiftCard({
  children,
  className,
  as: Tag = "div",
}: Props) {
  return (
    <Tag className={cn("motion-lift-card", className)}>{children}</Tag>
  );
}
