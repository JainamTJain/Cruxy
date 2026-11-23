"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getOfflinePack,
  relativeSavedLabel,
  type OfflinePack,
} from "@/lib/offline/pack-store";
import { cn } from "@/lib/utils";

type PackPayload = {
  caseNumber?: number;
  title?: string;
  savedAt?: string;
  case?: { title?: string; crux?: string | null; trap?: string | null };
  home?: {
    paragraphs?: Array<{ id: string; text: string }>;
  };
  brief?: { thesis?: string | null } | null;
  stance?: {
    thesis?: string | null;
    claims?: Array<{ id: string; text: string; logic_line?: string | null }>;
  };
  onePager?: {
    body?: {
      thesis?: string;
      claims?: Array<{ text?: string; supports?: string[] }>;
    };
  } | null;
  flashcards?: Array<{ id: string; front: string; back: string }>;
  questions?: Array<{ id: string; text: string }>;
};

type Props = {
  caseId: string;
  className?: string;
};

/**
 * Renders a previously saved offline pack when wifi is gone (UCSB Dec 5).
 */
export function OfflineCaseView({ caseId, className }: Props) {
  const [pack, setPack] = useState<OfflinePack | null>(null);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const row = await getOfflinePack(caseId);
        setPack(row);
        if (!row) setError("No offline copy on this phone yet.");
      } catch {
        setError("Could not open the offline copy.");
      }
    })();
  }, [caseId]);

  if (error && !pack) {
    return (
      <div className={cn("flex flex-col gap-3", className)}>
        <p className="m-0 text-sm text-cardinal">{error}</p>
        <Link
          href={`/case-brain/${caseId}`}
          className="text-sm font-semibold text-cardinal underline"
        >
          Back to the case
        </Link>
      </div>
    );
  }

  if (!pack) {
    return (
      <p className={cn("text-sm text-muted", className)} aria-busy>
        Opening offline copy…
      </p>
    );
  }

  const payload = (pack.payload ?? {}) as PackPayload;
  const paragraphs = payload.home?.paragraphs ?? [];
  const claims =
    payload.stance?.claims ??
    payload.onePager?.body?.claims?.map((c, i) => ({
      id: `op-${i}`,
      text: c.text ?? "",
      logic_line: null,
    })) ??
    [];
  const thesis =
    payload.brief?.thesis ??
    payload.stance?.thesis ??
    payload.onePager?.body?.thesis ??
    null;
  const cards = payload.flashcards ?? [];
  const questions = payload.questions ?? [];

  return (
    <article className={cn("flex flex-col gap-6", className)}>
      <header className="flex flex-col gap-2">
        <p className="m-0 text-xs font-bold uppercase tracking-[0.12em] text-muted">
          Offline case packet
        </p>
        <h1 className="font-display m-0 text-3xl font-extrabold tracking-[-0.02em]">
          Case {payload.caseNumber ?? pack.caseNumber}:{" "}
          {payload.title ?? pack.title}
        </h1>
        <p className="m-0 text-sm text-muted">
          {relativeSavedLabel(pack.savedAt)}
          {online ? "" : ". You are offline."}
        </p>
        {online ? (
          <Link
            href={`/case-brain/${caseId}`}
            className="w-fit text-sm font-semibold text-cardinal underline"
          >
            Open live case
          </Link>
        ) : null}
      </header>

      {thesis ? (
        <section>
          <h2 className="font-display m-0 text-xl font-extrabold">Stance</h2>
          <p className="mt-2 text-[15px] leading-relaxed">{thesis}</p>
        </section>
      ) : null}

      <section>
        <h2 className="font-display m-0 text-xl font-extrabold">The case</h2>
        <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-[#1C1F26]">
          {paragraphs.length === 0 ? (
            <p className="m-0 text-muted">Case text was not in this pack.</p>
          ) : (
            paragraphs.map((p) => (
              <p key={p.id} className="m-0">
                {p.text}
              </p>
            ))
          )}
        </div>
      </section>

      <section>
        <h2 className="font-display m-0 text-xl font-extrabold">Claims</h2>
        {claims.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No claims saved.</p>
        ) : (
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-[15px]">
            {claims.map((c) => (
              <li key={c.id}>{c.text}</li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h2 className="font-display m-0 text-xl font-extrabold">
          Likely questions
        </h2>
        {questions.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No questions in this pack.</p>
        ) : (
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px]">
            {questions.map((q) => (
              <li key={q.id}>{q.text}</li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-display m-0 text-xl font-extrabold">Flashcards</h2>
        {cards.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No cards in this pack.</p>
        ) : (
          <ul className="mt-3 list-none space-y-3 p-0">
            {cards.slice(0, 40).map((c) => (
              <li
                key={c.id}
                className="rounded-xl border border-[#E3E5E9] bg-white px-3 py-2.5"
              >
                <p className="m-0 text-sm font-semibold">{c.front}</p>
                <p className="m-0 mt-1 text-sm text-[#3B404A]">{c.back}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

/** Banner on the live case page when the device is offline and a pack exists. */
export function OfflineCaseBanner({ caseId }: { caseId: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const check = () => {
      void (async () => {
        if (typeof navigator === "undefined" || navigator.onLine) {
          setShow(false);
          return;
        }
        const pack = await getOfflinePack(caseId);
        setShow(Boolean(pack));
      })();
    };
    check();
    window.addEventListener("offline", check);
    window.addEventListener("online", check);
    return () => {
      window.removeEventListener("offline", check);
      window.removeEventListener("online", check);
    };
  }, [caseId]);

  if (!show) return null;
  return (
    <div
      role="status"
      className="rounded-xl border border-gold/40 bg-gold/10 px-3 py-2.5 text-sm"
    >
      You are offline.{" "}
      <Link
        href={`/case-brain/${caseId}/offline`}
        className="font-semibold text-cardinal underline"
      >
        Open the saved copy
      </Link>
    </div>
  );
}
