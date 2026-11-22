import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { WHATS_NEW } from "@/lib/help/whats-new";

function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function WhatsNewPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 animate-fade-up pb-10">
      <PageIntro title="What's new">
        Short dated notes so returning people see what moved.
      </PageIntro>

      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {WHATS_NEW.map((e) => (
          <li key={`${e.date}-${e.title}`} className="rounded-[20px] bg-white p-5">
            <p className="m-0 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              {formatDate(e.date)}
            </p>
            <h2 className="font-display m-0 mt-1 text-lg font-extrabold">
              {e.title}
            </h2>
            <p className="mt-2 m-0 text-sm text-ink">{e.body}</p>
            {e.href ? (
              <Link
                href={e.href}
                className="mt-3 inline-block text-sm font-semibold text-cardinal underline"
              >
                Open
              </Link>
            ) : null}
          </li>
        ))}
      </ol>

      <Link href="/help" className="text-sm underline text-muted">
        All help
      </Link>
    </main>
  );
}
