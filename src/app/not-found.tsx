import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#F3F4F6] px-6">
      <div className="flex max-w-md flex-col items-start gap-4 rounded-[24px] bg-white p-8 shadow-[0_10px_30px_rgba(17,19,24,0.08)]">
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
          Page not found
        </span>
        <h1 className="font-display m-0 text-[32px] font-extrabold leading-tight tracking-[-0.02em]">
          This page is not here.
        </h1>
        <p className="m-0 text-sm leading-relaxed text-muted">
          The link may be old, or the page moved. Your work is safe.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/today"
            className="inline-flex h-11 items-center rounded-xl bg-cardinal px-4 text-sm font-semibold text-white"
          >
            Go to Today
          </Link>
          <Link
            href="/case-brain"
            className="inline-flex h-11 items-center rounded-xl border border-mist bg-white px-4 text-sm font-semibold"
          >
            Open cases
          </Link>
          <Link
            href="/help"
            className="inline-flex h-11 items-center rounded-xl border border-mist bg-white px-4 text-sm font-semibold"
          >
            Report a problem
          </Link>
        </div>
      </div>
    </main>
  );
}
