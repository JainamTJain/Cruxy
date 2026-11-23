"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useRef } from "react";
import { AnnotatablePassages } from "@/components/case/annotatable-passages";
import { LinkedText } from "@/components/frameworks/linked-text";
import { Skeleton, SkeletonBlock } from "@/components/motion/skeleton";
import type { CaseHomePayload } from "@/lib/case-home/types";
import type { FileSegment } from "@/lib/library/segments";
import { cn } from "@/lib/utils";

type Props = {
  caseId: string;
  teamId: string;
  initial?: CaseHomePayload | null;
  focusFileId?: string | null;
  className?: string;
};

const KIND_ORDER: FileSegment["kind"][] = [
  "what",
  "key_point",
  "question",
  "speaker",
  "note",
];

function sortSegs(segs: FileSegment[]): FileSegment[] {
  return segs.slice().sort((a, b) => {
    const ai = KIND_ORDER.indexOf(a.kind);
    const bi = KIND_ORDER.indexOf(b.kind);
    if (ai !== bi) return ai - bi;
    return a.ord - b.ord;
  });
}

/**
 * Distilled Drive readings for one case: short cards, full original in place
 * with the same highlight / question / note tools as the case text.
 */
export function CaseReadings({
  caseId,
  teamId,
  initial = null,
  focusFileId = null,
  className,
}: Props) {
  const [data, setData] = useState<CaseHomePayload | null>(initial);
  const [openFull, setOpenFull] = useState<string | null>(focusFileId);
  const [loading, setLoading] = useState(!initial);
  // Show the skeleton only on first load; later refreshes stay quiet.
  const loadedOnce = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (force = false) => {
      if (initial && !force) {
        setData(initial);
        loadedOnce.current = true;
        setLoading(false);
        return;
      }
      if (!loadedOnce.current) setLoading(true);
      setError(null);
      const q = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
      const res = await fetch(`/api/case-home/${caseId}${q}`);
      const json = (await res.json()) as CaseHomePayload & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Could not load readings.");
        loadedOnce.current = true;
        setLoading(false);
        return;
      }
      setData(json);
      loadedOnce.current = true;
      setLoading(false);
    },
    [caseId, teamId, initial],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (focusFileId) setOpenFull(focusFileId);
  }, [focusFileId]);

  if (loading) {
    return (
      <div className={cn("flex flex-col gap-3", className)} aria-busy>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-28 w-full" rounded="lg" />
        <SkeletonBlock lines={3} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className={cn("text-sm text-cardinal", className)}>
        {error ?? "No readings yet."}
      </p>
    );
  }

  if (data.files.length === 0) {
    return (
      <section className={cn("rounded-[20px] bg-white p-5", className)}>
        <h2 className="font-display m-0 text-xl font-extrabold">Readings</h2>
        <p className="mt-2 text-sm text-muted">
          No Drive files tagged for this case yet. Sync the library, then they
          show here as short cards.
        </p>
        <Link
          href="/library"
          className="mt-3 inline-flex rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white"
        >
          Open library
        </Link>
      </section>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div>
        <h2 className="font-display m-0 text-xl font-extrabold">Readings</h2>
        <p className="mt-1 text-sm text-muted">
          Short takes from Drive. Open a card to highlight, ask or note in
          place.
        </p>
      </div>

      {data.files.map((f) => {
        const segs = sortSegs(data.segments_by_file[f.id] ?? []).slice(0, 8);
        const expanded = openFull === f.id;
        return (
          <article
            key={f.id}
            id={`reading-${f.id}`}
            className="rounded-[20px] border border-[#E3E5E9] bg-white p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display m-0 text-lg font-extrabold">
                {f.name}
              </h3>
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
                {f.type?.replace(/_/g, " ") ?? "file"}
              </span>
            </div>
            {f.what ? (
              <p className="mt-2 text-sm text-ink/85">
                <LinkedText text={f.what} caseId={caseId} />
              </p>
            ) : null}

            <ul className="mt-3 m-0 list-none space-y-2 p-0">
              {segs
                .filter((s) => s.kind !== "what")
                .map((s) => (
                  <li
                    key={s.id}
                    className="rounded-xl bg-[#F7F8FA] px-3 py-2 text-sm"
                  >
                    <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
                      {s.kind === "key_point"
                        ? "Key point"
                        : s.kind === "question"
                          ? "Question"
                          : s.kind === "speaker"
                            ? (s.speaker_name ?? "Speaker")
                            : "Note"}
                    </span>
                    <p className="m-0 mt-0.5 text-ink">
                      <LinkedText text={s.body} caseId={caseId} />
                    </p>
                  </li>
                ))}
            </ul>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setOpenFull(expanded ? null : f.id)}
                className="inline-flex min-h-11 items-center rounded-xl border border-[#E3E5E9] bg-white px-3 py-2 text-sm font-semibold"
              >
                {expanded ? "Hide full text" : "Open in place"}
              </button>
            </div>

            {expanded ? (
              <div className="mt-3">
                <FullOriginal
                  fileId={f.id}
                  caseId={caseId}
                  teamId={teamId}
                  caseAnnotations={data.annotations}
                  onAnnotationsChanged={() => void load(true)}
                />
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function FullOriginal({
  fileId,
  caseId,
  teamId,
  caseAnnotations,
  onAnnotationsChanged,
}: {
  fileId: string;
  caseId: string;
  teamId: string;
  caseAnnotations: CaseHomePayload["annotations"];
  onAnnotationsChanged?: () => void;
}) {
  const [passages, setPassages] = useState<
    { id: string; text: string; ord: number }[] | null
  >(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/library/files/${fileId}`);
      if (!res.ok) {
        if (!cancelled) setErr("Could not load the full file.");
        return;
      }
      const data = (await res.json()) as {
        passages: { id: string; text: string; ord: number }[];
        file?: { text_content?: string | null };
      };
      if (cancelled) return;
      const rows = data.passages
        .slice()
        .sort((a, b) => a.ord - b.ord)
        .map((p) => ({ id: p.id, text: p.text, ord: p.ord }));
      if (rows.length === 0 && data.file?.text_content) {
        setPassages([
          {
            id: `file-${fileId}`,
            text: data.file.text_content,
            ord: 0,
          },
        ]);
      } else {
        setPassages(rows);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileId, tick]);

  if (err) return <p className="text-sm text-cardinal">{err}</p>;
  if (!passages) {
    return (
      <div className="flex flex-col gap-2" aria-busy>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>
    );
  }

  const passageIds = new Set(passages.map((p) => p.id));
  const marks = caseAnnotations
    .filter(
      (a) =>
        (a.kind === "highlight" || a.kind === "comment") &&
        a.passage_id &&
        passageIds.has(a.passage_id),
    )
    .map((a) => ({
      id: a.id,
      needle: a.range && a.range !== "selection" ? a.range : a.body,
      kind: a.kind as "highlight" | "comment",
      personKey: a.person_id ?? a.person_name,
      personName: a.person_name,
      createdAt: a.created_at,
    }));

  if (passages.length === 0) {
    return <p className="text-sm text-muted">No text extracted.</p>;
  }

  // Synthetic file-level id cannot post highlights; show plain text.
  if (passages.length === 1 && passages[0]!.id.startsWith("file-")) {
    return (
      <div
        className="max-h-[320px] overflow-y-auto rounded-xl border border-[#E3E5E9] bg-[#F7F8FA] p-3 text-sm leading-relaxed"
        style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
      >
        <LinkedText text={passages[0]!.text} caseId={caseId} preWrap />
      </div>
    );
  }

  return (
    <AnnotatablePassages
      passages={passages.map((p) => ({ id: p.id, text: p.text }))}
      marks={marks}
      caseId={caseId}
      teamId={teamId}
      onSaved={() => {
        setTick((n) => n + 1);
        onAnnotationsChanged?.();
      }}
    />
  );
}
