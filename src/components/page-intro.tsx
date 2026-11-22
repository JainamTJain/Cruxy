import type { ReactNode } from "react";

/**
 * Page title plus one-line explainer for first-time visitors.
 * See docs/design/writing.md.
 */
export function PageIntro({
  eyebrow,
  title,
  children,
  titleClassName,
}: {
  eyebrow?: string;
  title: string;
  children: ReactNode;
  titleClassName?: string;
}) {
  return (
    <div>
      {eyebrow ? (
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
          {eyebrow}
        </p>
      ) : null}
      <h1
        className={
          titleClassName ??
          "font-display text-3xl font-semibold text-ink"
        }
      >
        {title}
      </h1>
      <p className="mt-1 max-w-xl text-sm text-muted">{children}</p>
    </div>
  );
}
