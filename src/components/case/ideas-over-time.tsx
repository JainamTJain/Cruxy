"use client";

import { useCallback, useEffect, useState } from "react";
import { LoadingGenie } from "@/components/cruxy/mood/loading-genie";
import type { CaseHomePayload, IdeaEvent } from "@/lib/case-home/types";
import { cn } from "@/lib/utils";

type Props = {
  caseId: string;
  teamId: string;
  initial?: CaseHomePayload | null;
  className?: string;
};

const KIND_LABEL: Record<IdeaEvent["kind"], string> = {
  version: "Map version",
  accepted: "Accepted",
  question: "Question",
  note: "Change",
};

function dayLabel(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

/**
 * How the team's thinking on this case changed: versions, accepted ideas,
 * new questions. Lives in src/components/case so C's Team Brief stays clear.
 */
export function IdeasOverTime({
  caseId,
  teamId,
  initial = null,
  className,
}: Props) {
  const [ideas, setIdeas] = useState<IdeaEvent[]>(initial?.ideas ?? []);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (initial) {
      setIdeas(initial.ideas);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const q = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
    const res = await fetch(`/api/case-home/${caseId}${q}`);
    const json = (await res.json()) as CaseHomePayload & { error?: string };
    if (!res.ok) {
      setError(json.error ?? "Could not load ideas.");
      setLoading(false);
      return;
    }
    setIdeas(json.ideas);
    setLoading(false);
  }, [caseId, teamId, initial]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className={cn("min-h-[220px]", className)}>
        <LoadingGenie label="Tracing ideas…" />
      </div>
    );
  }

  if (error) {
    return <p className={cn("text-sm text-cardinal", className)}>{error}</p>;
  }

  return (
    <section className={cn("rounded-[20px] bg-white p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
            Ideas over time
          </p>
          <h2 className="font-display m-0 text-xl font-extrabold">
            How thinking changed
          </h2>
        </div>
        <span className="text-xs text-muted">{ideas.length} moments</span>
      </div>

      {ideas.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          Nothing logged yet. Accept an idea or confirm a map version and it
          shows here.
        </p>
      ) : (
        <ol className="mt-4 m-0 list-none space-y-0 border-l-2 border-mist p-0 pl-4">
          {ideas.map((ev) => (
            <li key={ev.id} className="relative pb-4 last:pb-0">
              <span
                className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-cardinal"
                aria-hidden
              />
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
                  {KIND_LABEL[ev.kind]}
                </span>
                <span className="text-xs text-muted">{dayLabel(ev.at)}</span>
                {ev.by_name ? (
                  <span className="text-xs text-muted">by {ev.by_name}</span>
                ) : null}
              </div>
              <p className="m-0 mt-0.5 text-sm font-semibold text-ink">
                {ev.title}
              </p>
              <p className="m-0 mt-0.5 text-sm text-[#3B404A]">{ev.detail}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
