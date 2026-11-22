"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AnnotateSurface,
  ReadingToolbar,
  ReadingToolsProvider,
  buildLegend,
  renderMarkedText,
  type ReadingMark,
} from "@/components/case/reading-tools";
import { ThreadInline } from "@/components/discussion/thread-inline";
import { LinkedText } from "@/components/frameworks/linked-text";
import { Skeleton, SkeletonBlock } from "@/components/motion/skeleton";
import type { CaseHomePayload } from "@/lib/case-home/types";
import { cn } from "@/lib/utils";

type Props = {
  caseId: string;
  teamId: string;
  /** Prefetched payload avoids a second round trip when the parent already has it. */
  initial?: CaseHomePayload | null;
  className?: string;
};

/**
 * The case: full case text with Highlighter toggle, context menu, and
 * per-person coloured highlights that stay visible.
 */
export function TheCaseTab({ caseId, teamId, initial = null, className }: Props) {
  const [data, setData] = useState<CaseHomePayload | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initial);
  const [showSources, setShowSources] = useState(false);
  const [showAllNotes, setShowAllNotes] = useState(false);

  const load = useCallback(
    async (force = false) => {
      if (initial && !force) {
        setData(initial);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      const q = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
      const res = await fetch(`/api/case-home/${caseId}${q}`);
      const json = (await res.json()) as CaseHomePayload & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Could not load the case.");
        setLoading(false);
        return;
      }
      setData(json);
      setLoading(false);
    },
    [caseId, teamId, initial],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const marks: ReadingMark[] = useMemo(() => {
    if (!data) return [];
    return data.annotations
      .filter((a) => a.kind === "highlight" || a.kind === "comment")
      .map((a) => ({
        id: a.id,
        needle: a.range && a.range !== "selection" ? a.range : a.body,
        kind: a.kind as "highlight" | "comment",
        personKey: a.person_id ?? a.person_name,
        personName: a.person_name,
        createdAt: a.created_at,
      }));
  }, [data]);

  const legend = useMemo(() => buildLegend(marks), [marks]);

  if (loading) {
    return (
      <div className={cn("flex flex-col gap-3", className)} aria-busy>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-40 w-full" rounded="lg" />
        <SkeletonBlock lines={4} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className={cn("text-sm text-cardinal", className)}>
        {error ?? "Nothing here yet."}
      </p>
    );
  }

  const isQuestion = (a: { kind: string; body: string }) =>
    a.kind === "question" ||
    (a.kind === "comment" && a.body.startsWith("Question: "));
  const questions = data.annotations.filter(isQuestion);
  const notes = data.annotations.filter(
    (a) => a.kind === "comment" && !isQuestion(a),
  );
  const sources = data.sources ?? [];

  return (
    <ReadingToolsProvider caseId={caseId} teamId={teamId}>
      <div className={cn("flex flex-col gap-4", className)}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
              The case
            </p>
            <h2 className="font-display m-0 text-2xl font-extrabold tracking-[-0.02em]">
              Case {data.case.number}: {data.case.title}
            </h2>
          </div>
          <span className="text-xs text-muted">
            {data.source === "case_set"
              ? "From the case set"
              : "From team prep notes"}
          </span>
        </div>

        <ReadingToolbar legend={legend} />

        <article className="relative rounded-[20px] bg-white p-5 sm:p-7">
          <AnnotateSurface
            className="mx-auto max-w-[680px] text-[17px] leading-[1.65] text-[#1C1F26] sm:text-[19px] sm:leading-[1.7]"
            resolvePassageId={(el) =>
              (el.closest("[data-passage-id]") as HTMLElement | null)?.dataset
                .passageId ?? null
            }
            onSaved={() => void load(true)}
          >
            <div
              className="flex flex-col gap-4"
              style={{
                fontFamily: "var(--font-source-serif), Georgia, serif",
              }}
            >
              {data.paragraphs.map((p) => (
                <p
                  key={p.id}
                  className="m-0"
                  data-passage-id={
                    p.passage_id ??
                    (data.source === "case_set" ? p.id : undefined)
                  }
                >
                  {renderMarkedText(p.text, marks, caseId)}
                </p>
              ))}
            </div>
          </AnnotateSurface>

          {sources.length ? (
            <div className="mx-auto mt-6 max-w-[680px] border-t border-mist pt-3 font-sans">
              <button
                type="button"
                className="text-sm font-semibold text-ink underline"
                aria-expanded={showSources}
                onClick={() => setShowSources((v) => !v)}
              >
                {showSources ? "Hide sources" : `Sources (${sources.length})`}
              </button>
              {showSources ? (
                <ol className="mt-2 m-0 list-none space-y-2 p-0 text-[13px] leading-snug text-muted">
                  {sources.map((src) => (
                    <li key={src.n} className="break-words">
                      <span className="font-semibold text-ink">[{src.n}]</span>{" "}
                      {src.text}
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          ) : null}
        </article>

        {data.stakeholders.length > 0 ? (
          <section className="rounded-[20px] bg-white p-4 sm:p-5">
            <h3 className="font-display m-0 text-lg font-extrabold">
              Who is at stake
            </h3>
            <ul className="mt-3 m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
              {data.stakeholders.map((s) => (
                <li
                  key={s.id}
                  className="rounded-xl bg-[#F7F8FA] px-3 py-2.5 text-sm"
                >
                  <p className="m-0 font-semibold text-ink">{s.who}</p>
                  <p className="m-0 mt-0.5 text-muted">{s.stake}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {questions.length > 0 ? (
          <section className="rounded-[20px] bg-white p-4 sm:p-5">
            <h3 className="font-display m-0 text-lg font-extrabold">
              Questions on this case
            </h3>
            <ul className="mt-3 m-0 list-none space-y-2 p-0">
              {questions.map((q) => (
                <li
                  key={q.id}
                  className="rounded-xl border border-[#E3E5E9] px-3 py-2.5 text-sm"
                >
                  <span className="font-semibold">
                    {q.person_name ?? "Someone"}
                  </span>
                  {q.range && q.range !== "selection" ? (
                    <span className="text-muted">
                      {" "}
                      on “{q.range.slice(0, 60)}”
                    </span>
                  ) : null}
                  <p className="m-0 mt-1">
                    <LinkedText
                      text={q.body.replace(/^Question: /, "")}
                      caseId={caseId}
                    />
                  </p>
                  <ThreadInline
                    caseId={caseId}
                    teamId={teamId}
                    kind="annotation"
                    targetId={q.id}
                    title={
                      q.body.replace(/^Question: /, "").slice(0, 80) || "Question"
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {notes.length > 0 ? (
          <section className="rounded-[20px] bg-white p-4 sm:p-5">
            <h3 className="font-display m-0 text-lg font-extrabold">
              Notes in place
            </h3>
            <ul className="mt-3 m-0 list-none space-y-2 p-0">
              {(showAllNotes ? notes : notes.slice(0, 8)).map((n) => (
                <li
                  key={n.id}
                  className="rounded-xl bg-[#F7F8FA] px-3 py-2.5 text-sm"
                >
                  <span className="font-semibold">
                    {n.person_name ?? "Someone"}
                  </span>
                  {n.range ? (
                    <span className="text-muted">
                      {" "}
                      on “{n.range.slice(0, 40)}”
                    </span>
                  ) : null}
                  <p className="m-0 mt-1">
                    <LinkedText text={n.body} caseId={caseId} />
                  </p>
                  <ThreadInline
                    caseId={caseId}
                    teamId={teamId}
                    kind="annotation"
                    targetId={n.id}
                    title={n.body.slice(0, 80) || "Note"}
                  />
                </li>
              ))}
            </ul>
            {notes.length > 8 ? (
              <button
                type="button"
                className="mt-2 text-sm text-muted underline"
                onClick={() => setShowAllNotes((v) => !v)}
              >
                {showAllNotes ? "Show fewer" : `Show all ${notes.length} notes`}
              </button>
            ) : null}
          </section>
        ) : null}
      </div>
    </ReadingToolsProvider>
  );
}
