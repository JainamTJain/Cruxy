"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { useCallback, useEffect, useState, useRef } from "react";
import { AnnotatablePassages } from "@/components/case/annotatable-passages";
import { LinkedText } from "@/components/frameworks/linked-text";
import { Skeleton, SkeletonBlock } from "@/components/motion/skeleton";
import type {
  CaseHomePayload,
  CaseReadingSegment,
  SegmentFallacyFlag,
} from "@/lib/case-home/types";
import { cleanSegmentBody, plainFileTypeLabel } from "@/lib/library/clean-segment-text";
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

function sortSegs(segs: CaseReadingSegment[]): CaseReadingSegment[] {
  return segs.slice().sort((a, b) => {
    const ai = KIND_ORDER.indexOf(a.kind);
    const bi = KIND_ORDER.indexOf(b.kind);
    if (ai !== bi) return ai - bi;
    return a.ord - b.ord;
  });
}

function kindLabel(s: CaseReadingSegment): string {
  if (s.kind === "key_point") return "Key point";
  if (s.kind === "question") return "Open question";
  if (s.kind === "speaker") return s.speaker_name ?? "Speaker";
  return "Note";
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

  const patchSegment = useCallback(
    (fileId: string, segmentId: string, patch: Partial<CaseReadingSegment>) => {
      setData((prev) => {
        if (!prev) return prev;
        const list = prev.segments_by_file[fileId] ?? [];
        return {
          ...prev,
          segments_by_file: {
            ...prev.segments_by_file,
            [fileId]: list.map((s) =>
              s.id === segmentId ? { ...s, ...patch } : s,
            ),
          },
        };
      });
    },
    [],
  );

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
        <h2 className="font-display m-0 text-xl font-extrabold">
          Prep notes from Drive
        </h2>
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
        <h2 className="font-display m-0 text-xl font-extrabold">
          Prep notes from Drive
        </h2>
        <p className="mt-1 text-sm text-muted">
          Your team&apos;s own prep notes and files from the Ethics Bowl Drive,
          distilled by Cruxy into key points, open questions and notes. Each
          card names the source file and its type. Edit any point if the
          wording is off.
        </p>
      </div>

      {data.files.map((f) => {
        const segs = sortSegs(data.segments_by_file[f.id] ?? []).slice(0, 8);
        const expanded = openFull === f.id;
        const typeLabel = f.type_label || plainFileTypeLabel(f.type);
        const what = f.what ? cleanSegmentBody(f.what) : null;
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
                {typeLabel}
              </span>
            </div>
            {what ? (
              <p className="mt-2 text-sm text-ink/85">
                <LinkedText text={what} caseId={caseId} />
              </p>
            ) : null}

            <ul className="mt-3 m-0 list-none space-y-2 p-0">
              {segs
                .filter((s) => s.kind !== "what")
                .map((s) => (
                  <ReadingPointRow
                    key={s.id}
                    segment={s}
                    caseId={caseId}
                    teamId={teamId}
                    onPatched={(patch) => patchSegment(f.id, s.id, patch)}
                  />
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

function ReadingPointRow({
  segment,
  caseId,
  teamId,
  onPatched,
}: {
  segment: CaseReadingSegment;
  caseId: string;
  teamId: string;
  onPatched: (patch: Partial<CaseReadingSegment>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(segment.display_body);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  const display = cleanSegmentBody(segment.display_body) || segment.display_body;
  const original =
    cleanSegmentBody(segment.original_body) || segment.original_body;
  const edited = Boolean(
    segment.edited_by_name &&
      original &&
      display.trim() !== original.trim(),
  );

  useEffect(() => {
    if (!editing) setDraft(segment.display_body);
  }, [segment.display_body, editing]);

  async function save(next: string) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/case-home/segments/override", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          segmentId: segment.id,
          teamId,
          body: next,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        display_body?: string;
        original_body?: string;
        edited_by_name?: string | null;
        edited_at?: string | null;
        fallacy?: SegmentFallacyFlag | null;
      };
      if (!res.ok) {
        setErr(json.error ?? "Could not save.");
        return;
      }
      onPatched({
        display_body: json.display_body ?? next,
        body: json.display_body ?? next,
        original_body: json.original_body ?? segment.original_body,
        edited_by_name: json.edited_by_name ?? null,
        edited_at: json.edited_at ?? null,
        fallacy: json.fallacy ?? null,
      });
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  async function applyBetter(better: string) {
    await save(better);
  }

  async function restoreOriginal() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/case-home/segments/override", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          segmentId: segment.id,
          teamId,
          clear: true,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        display_body?: string;
        original_body?: string;
        fallacy?: SegmentFallacyFlag | null;
      };
      if (!res.ok) {
        setErr(json.error ?? "Could not restore.");
        return;
      }
      onPatched({
        display_body: json.display_body ?? original,
        body: json.display_body ?? original,
        original_body: json.original_body ?? original,
        edited_by_name: null,
        edited_at: null,
        fallacy: json.fallacy ?? null,
      });
      setShowOriginal(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-xl bg-[#F7F8FA] px-3 py-2 text-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
          {kindLabel(segment)}
        </span>
        {!editing ? (
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted hover:bg-white hover:text-ink"
            aria-label={`Edit ${kindLabel(segment).toLowerCase()}`}
            onClick={() => {
              setDraft(display);
              setEditing(true);
            }}
          >
            <Pencil className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-1 flex flex-col gap-2">
          <textarea
            className="min-h-[72px] w-full rounded-xl border border-ink/20 bg-white px-3 py-2 text-sm"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
          {err ? <p className="m-0 text-xs text-cardinal">{err}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              className="min-h-11 rounded-lg bg-ink px-3 text-xs font-semibold text-white disabled:opacity-50"
              onClick={() => void save(draft)}
            >
              Save
            </button>
            <button
              type="button"
              disabled={busy}
              className="min-h-11 rounded-lg px-3 text-xs font-semibold text-muted underline"
              onClick={() => {
                setDraft(display);
                setEditing(false);
                setErr(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="m-0 mt-0.5 text-ink">
            <LinkedText
              text={showOriginal ? original : display}
              caseId={caseId}
            />
          </p>
          {edited ? (
            <p className="m-0 mt-1 text-[11px] text-muted">
              Edited by {segment.edited_by_name}.{" "}
              <button
                type="button"
                className="font-semibold underline-offset-2 hover:underline"
                onClick={() => setShowOriginal((v) => !v)}
              >
                {showOriginal ? "Show team wording" : "Show original"}
              </button>
              {showOriginal ? (
                <>
                  {" "}
                  <button
                    type="button"
                    disabled={busy}
                    className="font-semibold underline-offset-2 hover:underline"
                    onClick={() => void restoreOriginal()}
                  >
                    Restore original
                  </button>
                </>
              ) : null}
            </p>
          ) : null}
          {segment.fallacy ? (
            <FallacyFlag
              flag={segment.fallacy}
              busy={busy}
              onApply={() => void applyBetter(segment.fallacy!.better)}
            />
          ) : null}
          {err ? <p className="m-0 mt-1 text-xs text-cardinal">{err}</p> : null}
        </>
      )}
    </li>
  );
}

function FallacyFlag({
  flag,
  busy,
  onApply,
}: {
  flag: SegmentFallacyFlag;
  busy: boolean;
  onApply: () => void;
}) {
  return (
    <div className="mt-2 rounded-lg border border-[#E3E5E9] bg-white px-2.5 py-2">
      <p className="m-0 text-[11px] font-bold uppercase tracking-wide text-cardinal">
        {flag.name}
      </p>
      <p className="m-0 mt-0.5 text-xs text-ink/85">{flag.why}</p>
      <p className="m-0 mt-1 text-xs text-muted">
        Better wording:{" "}
        <span className="text-ink">{flag.better}</span>
      </p>
      <button
        type="button"
        disabled={busy}
        className="mt-2 inline-flex min-h-11 items-center rounded-lg bg-ink px-3 text-xs font-semibold text-white disabled:opacity-50"
        onClick={onApply}
      >
        Use this wording
      </button>
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
