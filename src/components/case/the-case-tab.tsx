"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { LoadingGenie } from "@/components/cruxy/mood/loading-genie";
import type { CaseHomePayload } from "@/lib/case-home/types";
import { cn } from "@/lib/utils";

type Props = {
  caseId: string;
  teamId: string;
  /** Prefetched payload avoids a second round trip when the parent already has it. */
  initial?: CaseHomePayload | null;
  className?: string;
};

function markText(
  text: string,
  marks: { needle: string; kind: "highlight" | "comment" }[],
) {
  const hits: { from: number; to: number; kind: "highlight" | "comment" }[] =
    [];
  for (const m of marks) {
    const needle = m.needle.trim();
    if (needle.length < 6) continue;
    const idx = text.indexOf(needle);
    if (idx >= 0) hits.push({ from: idx, to: idx + needle.length, kind: m.kind });
  }
  hits.sort((a, b) => a.from - b.from);
  if (hits.length === 0) return text;

  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  for (const h of hits) {
    if (h.from < cursor) continue;
    if (h.from > cursor) nodes.push(text.slice(cursor, h.from));
    const slice = text.slice(h.from, h.to);
    nodes.push(
      h.kind === "highlight" ? (
        <mark key={key++} className="rounded-[3px] bg-[#FFE58A] px-0.5">
          {slice}
        </mark>
      ) : (
        <span
          key={key++}
          className="border-b-2 border-[#0F7B6C] bg-[#D8EEEB]"
        >
          {slice}
        </span>
      ),
    );
    cursor = h.to;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

/**
 * The case: full case text (or seed facts) with highlights, questions and notes
 * kept in place. Own file so Workstream C can ship Team Brief beside it.
 */
export function TheCaseTab({ caseId, teamId, initial = null, className }: Props) {
  const [data, setData] = useState<CaseHomePayload | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initial);

  const load = useCallback(async () => {
    if (initial) {
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
  }, [caseId, teamId, initial]);

  useEffect(() => {
    void load();
  }, [load]);

  const marks = useMemo(() => {
    if (!data) return [];
    return data.annotations
      .filter((a) => a.kind === "highlight" || a.kind === "comment")
      .map((a) => ({
        needle: a.range && a.range !== "selection" ? a.range : a.body,
        kind: a.kind as "highlight" | "comment",
      }));
  }, [data]);

  if (loading) {
    return (
      <div className={cn("min-h-[280px]", className)}>
        <LoadingGenie label="Opening the case…" />
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

  const questions = data.annotations.filter((a) => a.kind === "question");
  const notes = data.annotations.filter((a) => a.kind === "comment");

  return (
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

      <article className="rounded-[20px] bg-white p-5 sm:p-7">
        <div
          className="mx-auto flex max-w-[680px] flex-col gap-4 text-[17px] leading-[1.65] text-[#1C1F26] sm:text-[19px] sm:leading-[1.7]"
          style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
        >
          {data.paragraphs.map((p) => (
            <p key={p.id} className="m-0">
              {markText(p.text, marks)}
            </p>
          ))}
        </div>
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
                {q.body}
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
            {notes.slice(0, 8).map((n) => (
              <li key={n.id} className="rounded-xl bg-[#F7F8FA] px-3 py-2.5 text-sm">
                <span className="font-semibold">
                  {n.person_name ?? "Someone"}
                </span>
                {n.range ? (
                  <span className="text-muted"> on “{n.range.slice(0, 40)}”</span>
                ) : null}
                <p className="m-0 mt-1">{n.body}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
