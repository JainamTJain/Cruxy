"use client";

import { cn } from "@/lib/utils";
import { STATUS_LABEL, type StatusTone } from "@/lib/access/status";

/**
 * Status with colour and a text label (Wave 9 I: colour is never the only signal).
 */
export function StatusPill({
  tone,
  label,
  className,
}: {
  tone: StatusTone;
  /** Override the default tone label. */
  label?: string;
  className?: string;
}) {
  const text = label ?? STATUS_LABEL[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
        tone === "ok" && "bg-emerald-50 text-emerald-900 ring-emerald-200",
        tone === "warn" && "bg-amber-50 text-amber-950 ring-amber-200",
        tone === "risk" && "bg-red-50 text-red-900 ring-red-200",
        tone === "info" && "bg-sky-50 text-sky-950 ring-sky-200",
        tone === "neutral" && "bg-mist text-ink ring-ink/10",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-2 w-2 rounded-full",
          tone === "ok" && "bg-emerald-600",
          tone === "warn" && "bg-amber-500",
          tone === "risk" && "bg-red-600",
          tone === "info" && "bg-sky-600",
          tone === "neutral" && "bg-muted",
        )}
      />
      {text}
    </span>
  );
}

/** Team chip: colour swatch plus the team name in text. */
export function TeamChip({
  name,
  colour,
  className,
}: {
  name: string;
  colour?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-ink ring-1 ring-ink/10",
        className,
      )}
    >
      <span
        aria-hidden
        className="h-2.5 w-2.5 rounded-full ring-1 ring-ink/20"
        style={{ backgroundColor: colour || "var(--crux-muted)" }}
      />
      <span>{name}</span>
    </span>
  );
}
