"use client";

import Link from "next/link";

type Props = {
  title?: string;
  detail?: string;
  onRetry?: () => void;
  /** When true, render a full-page shell (for global-error). */
  fullPage?: boolean;
};

/**
 * Shared friendly error UI: short copy, Try again, Report a problem.
 * Never says "AI". Never shows stack traces to the person.
 */
export function ErrorFallback({
  title = "Something went wrong",
  detail = "Your work is safe. Try again, or tell us what happened.",
  onRetry,
  fullPage = false,
}: Props) {
  const body = (
    <div className="flex max-w-md flex-col items-start gap-4 rounded-[24px] bg-white p-8 shadow-[0_10px_30px_rgba(17,19,24,0.08)]">
      <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#5A606B]">
        Crux
      </span>
      <h1 className="m-0 font-[family-name:var(--font-bricolage)] text-[32px] font-extrabold leading-tight tracking-[-0.02em] text-[#111318]">
        {title}
      </h1>
      <p className="m-0 text-sm leading-relaxed text-[#5A606B]">{detail}</p>
      <div className="flex flex-wrap gap-2">
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-11 items-center rounded-xl bg-[#9D2235] px-4 text-sm font-semibold text-white"
          >
            Try again
          </button>
        ) : (
          <Link
            href="/today"
            className="inline-flex h-11 items-center rounded-xl bg-[#9D2235] px-4 text-sm font-semibold text-white"
          >
            Go to Today
          </Link>
        )}
        <Link
          href="/help"
          className="inline-flex h-11 items-center rounded-xl border border-[#E3E5E9] bg-white px-4 text-sm font-semibold text-[#111318]"
        >
          Report a problem
        </Link>
      </div>
    </div>
  );

  if (!fullPage) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-6 py-10">
        {body}
      </div>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#F3F4F6] px-6">
      {body}
    </main>
  );
}
