"use client";

/**
 * Working document tab (case workflow v2).
 * Document on the left, suggestions rail on the right, always together.
 * Import is team-level (all cases); Start creates every active case.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ThreadInline } from "@/components/discussion/thread-inline";
import {
  AnnotateSurface,
  ReadingToolbar,
  ReadingToolsProvider,
  buildLegend,
  renderMarkedText,
  type ReadingMark,
} from "@/components/case/reading-tools";
import { LoadingGenie } from "@/components/cruxy/mood/loading-genie";
import { LinkedText } from "@/components/frameworks/linked-text";
import { cn } from "@/lib/utils";

type WorkingAnn = {
  id: string;
  target_kind: "passage" | "section";
  target_id: string;
  kind: "highlight" | "comment";
  range: string;
  body: string | null;
  person_id: string;
  person_name: string | null;
  created_at: string;
};

type Hub = {
  brief: {
    id: string;
    mode: string;
    working_path: "imported" | "crux" | null;
    drive_file_id: string | null;
    drive_title: string | null;
    thesis: string | null;
    last_synced_at: string | null;
    last_synced_label: string | null;
  };
  sectionDefs: Array<{ key: string; label: string }>;
  passages: Array<{ id: string; anchor: string; text: string; ord: number }>;
  sections: Array<{
    key: string;
    label: string;
    body: string;
    updated_by_name: string | null;
    updated_at_label: string | null;
    socratic: { id: string; question: string } | null;
  }>;
  suggestions: Array<{
    id: string;
    kind: string;
    text: string;
    citation: string | null;
    paragraph_anchor: string | null;
    section_key: string | null;
    source: string;
    created_by_name: string | null;
    created_at_label: string | null;
    weak_spot?: string | null;
    why_weak?: string | null;
    stronger_version?: string | null;
    question_back?: string | null;
    fallacy_name?: string | null;
    logic_chain?: string | null;
    research_sources?: Array<{ title: string; url: string | null; why: string }> | null;
  }>;
  checklist: Array<{
    id: string;
    text: string;
    kind: string;
    done: boolean;
    suggestion_id?: string | null;
    created_by_name: string | null;
    created_at_label: string | null;
    done_by_name: string | null;
    done_at_label: string | null;
  }>;
  library: Array<{
    id: string;
    text: string;
    kind: string | null;
    decision: "tick" | "cross" | null;
    reason: string | null;
    decided_by_name: string | null;
    decided_at_label: string | null;
    created_by_name: string | null;
    created_at_label: string | null;
  }>;
  crossedCount: number;
  viewer: { personId: string; teamId: string };
  canEdit?: boolean;
};

type ImportSplit = {
  id: string;
  kind: "found" | "not_in_regional" | "unmatched";
  case_number: number | null;
  case_id: string | null;
  title_guess: string | null;
  section_count: number;
  assigned_case_id: string | null;
};

type ImportReview = {
  batchId?: string;
  batch?: { id: string; status: string };
  reviewLines: string[];
  splits: ImportSplit[];
  cases: Array<{ id: string; number: number; title: string }>;
};

const KIND_LABEL: Record<string, string> = {
  evidence: "Evidence",
  gap: "Gap",
  counter: "Counterargument",
  sharper: "Sharper claim",
  question: "Question",
  missing_perspective: "Missing perspective",
  missing_stakeholder: "Missing stakeholder",
  unanswered_counter: "Unanswered objection",
  logical_fallacy: "Fallacy",
  disconnected_claim: "Claim does not connect",
  loose_end: "Loose end",
  evidence_gap: "Needs evidence",
  sharper_wording: "Sharper wording",
  missing_link: "Missing link",
};

function Attr({
  name,
  when,
}: {
  name: string | null | undefined;
  when: string | null | undefined;
}) {
  if (!name && !when) return null;
  return (
    <p className="m-0 mt-1 text-[11px] text-muted">
      {[name, when].filter(Boolean).join(", ")}
    </p>
  );
}

function IdeaAndCoherenceBar({
  busy,
  researching,
  ideaDraft,
  setIdeaDraft,
  onTellIdea,
  onCoherence,
}: {
  busy: boolean;
  researching: boolean;
  ideaDraft: string;
  setIdeaDraft: (v: string) => void;
  onTellIdea: () => void;
  onCoherence: () => void;
}) {
  return (
    <section className="rounded-[20px] bg-white p-5">
      <h3 className="font-display m-0 text-lg font-extrabold">
        Tell Cruxy an idea
      </h3>
      <p className="mt-1 text-sm text-muted">
        Cruxy researches it against the case, your library, published
        philosophy and the wider web, works out where it fits in your reasoning
        and drafts it as a suggestion with your name.
        Strong ideas may also reach other teams anonymously.
      </p>
      <textarea
        rows={3}
        className="mt-3 w-full rounded-[10px] border border-mist px-3 py-2 text-sm"
        placeholder="My idea is…"
        value={ideaDraft}
        disabled={busy}
        onChange={(e) => setIdeaDraft(e.target.value)}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !ideaDraft.trim()}
          className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          onClick={onTellIdea}
        >
          {researching ? "Researching your idea, this takes a minute..." : "Add as suggestion"}
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded-xl border border-mist bg-[#F7F8FA] px-4 py-2 text-sm font-semibold disabled:opacity-60"
          onClick={onCoherence}
        >
          Check coherence
        </button>
      </div>
    </section>
  );
}

export function WorkingDocument({
  caseId,
  teamId,
  queue,
}: {
  caseId: string;
  teamId: string;
  /** Other ideas waiting on this case (practice, research, other teams), shown in the same rail. */
  queue?: { count: number; node: React.ReactNode };
}) {
  const [data, setData] = useState<Hub | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [driveUrls, setDriveUrls] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [crossReasons, setCrossReasons] = useState<Record<string, string>>({});
  const [sectionDrafts, setSectionDrafts] = useState<Record<string, string>>(
    {},
  );
  const [socraticAnswers, setSocraticAnswers] = useState<
    Record<string, string>
  >({});
  const [review, setReview] = useState<ImportReview | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [ideaDraft, setIdeaDraft] = useState("");
  const [took, setTook] = useState<{ suggestionId: string; sectionKey: string | null } | null>(null);
  const [researching, setResearching] = useState(false);
  const [annotations, setAnnotations] = useState<WorkingAnn[]>([]);

  const loadAnnotations = useCallback(async () => {
    const res = await fetch(
      `/api/case/working-annotations?caseId=${encodeURIComponent(caseId)}&teamId=${encodeURIComponent(teamId)}`,
    );
    if (!res.ok) return;
    const json = (await res.json()) as { annotations?: WorkingAnn[] };
    setAnnotations(json.annotations ?? []);
  }, [caseId, teamId]);

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/case/working-document?caseId=${encodeURIComponent(caseId)}&teamId=${encodeURIComponent(teamId)}`,
    );
    const json = (await res.json()) as Hub & { error?: string };
    if (!res.ok) {
      setError(json.error ?? "Could not load the working document.");
      return;
    }
    setData(json);
    setError(null);
    const drafts: Record<string, string> = {};
    for (const s of json.sections) drafts[s.key] = s.body;
    setSectionDrafts(drafts);
    await loadAnnotations();
  }, [caseId, teamId, loadAnnotations]);

  useEffect(() => {
    void load();
  }, [load]);
  const saveWorkingAnn = useCallback(
    async (
      kind: "highlight" | "comment",
      targetKind: "passage" | "section",
      targetId: string,
      range: string,
      body?: string,
    ) => {
      const res = await fetch("/api/case/working-annotations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          caseId,
          teamId,
          targetKind,
          targetId,
          kind,
          range,
          body: body ?? null,
        }),
      });
      if (!res.ok) return false;
      await loadAnnotations();
      return true;
    },
    [caseId, teamId, loadAnnotations],
  );

  const marksFor = useCallback(
    (targetKind: "passage" | "section", targetId: string): ReadingMark[] =>
      annotations
        .filter((a) => a.target_kind === targetKind && a.target_id === targetId)
        .map((a) => ({
          id: a.id,
          needle: a.range,
          kind: a.kind,
          personKey: a.person_id,
          personName: a.person_name,
          createdAt: a.created_at,
        })),
    [annotations],
  );

  const allMarks: ReadingMark[] = useMemo(
    () =>
      annotations.map((a) => ({
        id: a.id,
        needle: a.range,
        kind: a.kind,
        personKey: a.person_id,
        personName: a.person_name,
        createdAt: a.created_at,
      })),
    [annotations],
  );
  const legend = useMemo(() => buildLegend(allMarks), [allMarks]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/case/working-document", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseId, teamId, ...body }),
      });
      const json = (await res.json()) as Hub & {
        error?: string;
        took?: { suggestionId: string; sectionKey: string | null } | null;
      };
      if (!res.ok) {
        setError(json.error ?? "Could not save.");
        return false;
      }
      setData(json);
      if (body.action === "tick_suggestion") setTook(json.took ?? null);
      if (body.action === "undo_take") setTook(null);
      const drafts: Record<string, string> = {};
      for (const s of json.sections) drafts[s.key] = s.body;
      setSectionDrafts(drafts);
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function teamImport(
    action: string,
    extra: Record<string, unknown> = {},
  ) {
    setBusy(true);
    setError(null);
    setStatusNote(null);
    try {
      const res = await fetch("/api/team/import-documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = (await res.json()) as ImportReview & {
        error?: string;
        started?: number;
        filledCases?: number;
        batchId?: string;
      };
      if (!res.ok) {
        setError(json.error ?? "Could not run import.");
        return null;
      }
      if (action === "start_all") {
        setStatusNote(
          `Started working documents for ${json.started ?? 0} cases.`,
        );
        await load();
        return json;
      }
      if (action === "confirm") {
        setStatusNote(
          `Filled ${json.filledCases ?? 0} case working documents.`,
        );
        setReview(null);
        await load();
        return json;
      }
      setReview({
        batchId: json.batchId ?? json.batch?.id,
        batch: json.batch,
        reviewLines: json.reviewLines ?? [],
        splits: json.splits ?? [],
        cases: json.cases ?? [],
      });
      return json;
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    if (error) return <p className="text-sm text-cardinal">{error}</p>;
    return <LoadingGenie label="Loading working document..." />;
  }

  const path = data.brief.working_path;
  const canEdit = data.canEdit !== false;
  const editBusy = busy || !canEdit;

  return (
    <ReadingToolsProvider caseId={caseId} teamId={teamId}>
      <div className="flex flex-col gap-4">
        {error ? (
          <p className="rounded-xl border border-cardinal/30 bg-cardinal/5 px-3 py-2 text-sm text-cardinal">
            {error}
          </p>
        ) : null}
        {statusNote ? (
          <p className="m-0 rounded-xl bg-[#F7F8FA] px-3.5 py-2 text-sm text-[#3B404A]">
            {statusNote}
          </p>
        ) : null}

        {!canEdit ? (
          <p className="m-0 rounded-xl bg-[#F7F8FA] px-3.5 py-2 text-sm text-muted">
            Read only. Only Dr. B and Jainam can open another team&apos;s
            document.
          </p>
        ) : null}

        {path ? <ReadingToolbar legend={legend} /> : null}

        {path && canEdit ? (
          <IdeaAndCoherenceBar
            busy={editBusy}
            ideaDraft={ideaDraft}
            setIdeaDraft={setIdeaDraft}
            researching={researching}
            onTellIdea={() => {
              setResearching(true);
              void post({
                action: "tell_idea",
                text: ideaDraft.trim(),
              })
                .then((ok) => {
                  if (ok) {
                    setIdeaDraft("");
                    setStatusNote(
                      "Cruxy researched your idea, found where it fits and drafted it. It's at the top of Suggestions with your name.",
                    );
                  }
                })
                .finally(() => setResearching(false));
            }}
            onCoherence={() => void post({ action: "coherence_check" })}
          />
        ) : null}

        {!path ? (
          <EmptyTeamChoice
            busy={editBusy}
            driveUrls={driveUrls}
            setDriveUrls={setDriveUrls}
            pasteText={pasteText}
            setPasteText={setPasteText}
            review={review}
            onStartReview={() => {
              const urls = driveUrls
                .split(/\n+/)
                .map((u) => u.trim())
                .filter(Boolean);
              const sources = [
                ...urls.map((driveUrl) => ({ driveUrl })),
                ...(pasteText.trim()
                  ? [{ pastedText: pasteText.trim(), title: "Pasted file" }]
                  : []),
              ];
              void teamImport("start_review", { sources });
            }}
            onAssign={(splitId, caseIdAssign) =>
              void teamImport("assign_split", {
                batchId: review?.batchId ?? review?.batch?.id,
                splitId,
                caseId: caseIdAssign,
              })
            }
            onConfirm={() =>
              void teamImport("confirm", {
                batchId: review?.batchId ?? review?.batch?.id,
              })
            }
            onStartAll={() => void teamImport("start_all")}
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] xl:grid-cols-[minmax(0,1fr)_400px]">
            <div className="flex min-w-0 flex-col gap-4">
              {path === "imported" ? (
                <ImportedBody
                  caseId={caseId}
                  data={data}
                  marksFor={marksFor}
                  onHighlight={(text, passageId) =>
                    saveWorkingAnn("highlight", "passage", passageId, text)
                  }
                  onComment={(text, passageId, body) =>
                    saveWorkingAnn("comment", "passage", passageId, text, body)
                  }
                />
              ) : (
                <CruxBody
                  caseId={caseId}
                  data={data}
                  marksFor={marksFor}
                  onHighlight={(text, sectionKey) =>
                    saveWorkingAnn("highlight", "section", sectionKey, text)
                  }
                  onComment={(text, sectionKey, body) =>
                    saveWorkingAnn("comment", "section", sectionKey, text, body)
                  }
                  busy={editBusy}
                  sectionDrafts={sectionDrafts}
                  setSectionDrafts={setSectionDrafts}
                  socraticAnswers={socraticAnswers}
                  setSocraticAnswers={setSocraticAnswers}
                  onSave={(key) =>
                    void post({
                      action: "save_section",
                      sectionKey: key,
                      body: sectionDrafts[key] ?? "",
                    })
                  }
                  onAsk={(key) =>
                    void post({ action: "ask_socratic", sectionKey: key })
                  }
                  onAnswer={(key, socraticId) =>
                    void post({
                      action: "answer_socratic",
                      sectionKey: key,
                      socraticId,
                      answer: socraticAnswers[key] ?? "",
                    }).then((ok) => {
                      if (ok) {
                        setSocraticAnswers((m) => ({ ...m, [key]: "" }));
                      }
                    })
                  }
                />
              )}
              <ChecklistPanel caseId={caseId} teamId={teamId} data={data} />
            </div>

            <SuggestionsRail
              caseId={caseId}
              teamId={teamId}
              suggestions={data.suggestions}
              queue={queue}
              took={took}
              sectionLabel={(k) =>
                data.sectionDefs.find((d) => d.key === k)?.label ?? "the document"
              }
              onUndo={(id) => void post({ action: "undo_take", suggestionId: id })}
              onResearch={(id) => void post({ action: "research_idea", suggestionId: id })}
              busy={editBusy}
              crossReasons={crossReasons}
              setCrossReasons={setCrossReasons}
              onTick={(id) =>
                void post({ action: "tick_suggestion", suggestionId: id })
              }
              onCross={(id) =>
                void post({
                  action: "cross_suggestion",
                  suggestionId: id,
                  reason: crossReasons[id] || null,
                })
              }
            />
          </div>
        )}

        {path ? (
          <p className="m-0 text-sm text-muted">
            Have your own documents?{" "}
            <Link
              href="/case-brain?import=1#import"
              className="font-semibold text-cardinal underline"
            >
              Import them to replace it
            </Link>
            . Or open{" "}
            <Link
              href="/team"
              className="font-semibold text-cardinal underline"
            >
              Team
            </Link>
            .
          </p>
        ) : null}
      </div>
    </ReadingToolsProvider>
  );
}

function EmptyTeamChoice({
  busy,
  driveUrls,
  setDriveUrls,
  pasteText,
  setPasteText,
  review,
  onStartReview,
  onAssign,
  onConfirm,
  onStartAll,
}: {
  busy: boolean;
  driveUrls: string;
  setDriveUrls: (v: string) => void;
  pasteText: string;
  setPasteText: (v: string) => void;
  review: ImportReview | null;
  onStartReview: () => void;
  onAssign: (splitId: string, caseId: string) => void;
  onConfirm: () => void;
  onStartAll: () => void;
}) {
  return (
    <section className="rounded-[20px] bg-white p-5">
      <h2 className="font-display m-0 text-[28px] font-extrabold leading-tight sm:text-[36px]">
        Working documents
      </h2>
      <p className="mt-2 text-sm text-muted">
        One import for the whole team. Crux splits by case. Or start every case
        from the truth source.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[16px] border-2 border-mist bg-[#F7F8FA] p-4">
          <h3 className="font-display m-0 text-lg font-extrabold">
            Import our documents
          </h3>
          <p className="mt-1 text-[13px] leading-snug text-[#3B404A]">
            One or more Google Docs or pasted files that usually hold all cases
            together. Crux splits them and shows a short review before filling.
          </p>
          <textarea
            rows={3}
            className="mt-3 w-full rounded-[10px] border border-mist bg-white px-3 py-2 text-sm"
            placeholder="One Google Doc link per line"
            value={driveUrls}
            disabled={busy}
            onChange={(e) => setDriveUrls(e.target.value)}
          />
          <textarea
            rows={3}
            className="mt-2 w-full rounded-[10px] border border-mist bg-white px-3 py-2 text-sm"
            placeholder="Or paste document text here"
            value={pasteText}
            disabled={busy}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <button
            type="button"
            disabled={busy || (!driveUrls.trim() && !pasteText.trim())}
            className="mt-3 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            onClick={onStartReview}
          >
            Import our documents
          </button>
        </div>

        <div className="rounded-[16px] border-2 border-mist bg-[#F7F8FA] p-4">
          <h3 className="font-display m-0 text-lg font-extrabold">
            Start our working documents
          </h3>
          <p className="mt-1 text-[13px] leading-snug text-[#3B404A]">
            Creates one for every active case from the truth source, with
            perspectives, analogies and research suggestions already waiting.
          </p>
          <button
            type="button"
            disabled={busy}
            className="mt-3 rounded-xl bg-cardinal px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            onClick={onStartAll}
          >
            Start our working documents
          </button>
        </div>
      </div>

      {review ? (
        <div className="mt-5 rounded-[16px] border border-mist bg-white p-4">
          <h3 className="font-display m-0 text-lg font-extrabold">
            Review before confirm
          </h3>
          <ul className="mt-2 m-0 list-disc space-y-1 pl-5 text-sm">
            {review.reviewLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="mt-3 flex flex-col gap-3">
            {review.splits
              .filter((s) => s.kind === "unmatched")
              .map((s) => (
                <label
                  key={s.id}
                  className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center"
                >
                  <span className="text-muted">
                    Unmatched ({s.section_count} parts), choose a case:
                  </span>
                  <select
                    className="rounded-lg border border-mist px-2 py-1.5"
                    disabled={busy}
                    value={s.assigned_case_id ?? ""}
                    onChange={(e) => {
                      if (e.target.value) onAssign(s.id, e.target.value);
                    }}
                  >
                    <option value="">Pick case</option>
                    {review.cases.map((c) => (
                      <option key={c.id} value={c.id}>
                        Case {c.number}: {c.title}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
          </div>
          <button
            type="button"
            disabled={busy}
            className="mt-4 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            onClick={onConfirm}
          >
            Confirm and fill working documents
          </button>
        </div>
      ) : null}
    </section>
  );
}

function SuggestionsRail({
  caseId,
  teamId,
  suggestions,
  queue,
  took,
  sectionLabel,
  onUndo,
  onResearch,
  busy,
  crossReasons,
  setCrossReasons,
  onTick,
  onCross,
}: {
  caseId: string;
  teamId: string;
  suggestions: Hub["suggestions"];
  queue?: { count: number; node: React.ReactNode };
  took: { suggestionId: string; sectionKey: string | null } | null;
  sectionLabel: (key: string) => string;
  onUndo: (id: string) => void;
  busy: boolean;
  crossReasons: Record<string, string>;
  setCrossReasons: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onTick: (id: string) => void;
  onCross: (id: string) => void;
  onResearch?: (id: string) => void;
}) {
  const total = suggestions.length + (queue?.count ?? 0);
  // Teammates' ideas first, then breaks in the reasoning, then the rest.
  const ORDER = ["missing_link", "logical_fallacy", "disconnected_claim", "unanswered_counter", "evidence_gap"];
  const rank = (x: Hub["suggestions"][number]) =>
    x.source === "member" ? -1 : ORDER.includes(x.kind) ? ORDER.indexOf(x.kind) : ORDER.length;
  const ordered = [...suggestions].sort((a, b) => rank(a) - rank(b));
  const [filter, setFilter] = useState<SuggestionGroup | "all">("all");
  const counts = ordered.reduce<Record<string, number>>((m, x) => {
    const g = groupOf(x);
    m[g] = (m[g] ?? 0) + 1;
    return m;
  }, {});
  const shown = filter === "all" ? ordered : ordered.filter((x) => groupOf(x) === filter);
  const [taking, setTaking] = useState<string | null>(null);
  useEffect(() => {
    if (!busy) setTaking(null);
  }, [busy]);
  return (
    <aside className="rounded-[20px] bg-white p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display m-0 text-lg font-extrabold">Suggestions</h3>
        <span className="font-display text-lg font-extrabold text-cardinal">
          {total}
        </span>
      </div>
      <p className="mt-1 text-[13px] text-muted">
        Take writes it into your document. Details shows the reasoning and sources.
      </p>
      {ordered.length > 3 ? (
        <div className="mt-2 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter suggestions">
          {(["all", ...GROUP_ORDER.filter((g) => counts[g])] as const).map((g) => (
            <button
              key={g}
              type="button"
              role="tab"
              aria-selected={filter === g}
              onClick={() => setFilter(g)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[12px] font-semibold",
                filter === g ? "bg-ink text-white" : "bg-[#F1F2F4] text-[#3B404A]",
              )}
            >
              {g === "all" ? "All" : GROUP_LABEL[g]} {g === "all" ? ordered.length : counts[g]}
            </button>
          ))}
        </div>
      ) : null}
      {taking ? (
        <p className="mt-3 rounded-xl bg-[#F7F8FA] px-3 py-2 text-[13px] text-[#3B404A]">
          Cruxy is writing it into your document...
        </p>
      ) : null}
      {took && !taking ? (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-[#E8F4EC] px-3 py-2 text-[13px] text-[#1F5F3B]">
          <span>
            {took.sectionKey
              ? `Added to ${sectionLabel(took.sectionKey)}.`
              : "Added to your to-do list."}
          </span>
          {took.sectionKey ? (
            <button
              type="button"
              disabled={busy}
              className="font-semibold underline"
              onClick={() => onUndo(took.suggestionId)}
            >
              Undo
            </button>
          ) : null}
        </div>
      ) : null}
      {total === 0 ? (
        <p className="mt-3 text-sm text-muted">None waiting.</p>
      ) : null}
      {suggestions.length ? (
        <ul className="mt-3 m-0 list-none space-y-2 p-0">
          {shown.map((s) => (
            <SuggestionCard
              key={s.id}
              s={s}
              sectionLabel={s.section_key ? sectionLabel(s.section_key) : null}
              caseId={caseId}
              teamId={teamId}
              busy={busy}
              reason={crossReasons[s.id] ?? ""}
              onReason={(v) => setCrossReasons((m) => ({ ...m, [s.id]: v }))}
              onTick={() => {
                setTaking(s.id);
                onTick(s.id);
              }}
              onCross={() => onCross(s.id)}
              onResearch={onResearch ? () => onResearch(s.id) : undefined}
            />
          ))}
        </ul>
      ) : null}
      {queue && queue.count > 0 ? (
        <div className="mt-4 border-t border-[#ECEEF1] pt-3">
          <p className="m-0 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
            From practice, research and other teams
          </p>
          <div className="mt-2 flex flex-col gap-2">{queue.node}</div>
        </div>
      ) : null}
    </aside>
  );
}

type SuggestionGroup = "people" | "logic" | "objections" | "evidence" | "wording" | "other";
const GROUP_ORDER: SuggestionGroup[] = ["people", "logic", "objections", "evidence", "wording", "other"];
const GROUP_LABEL: Record<SuggestionGroup, string> = {
  people: "Teammates and coach",
  logic: "Logic",
  objections: "Objections",
  evidence: "Evidence",
  wording: "Wording",
  other: "Other",
};
const GROUP_TONE: Record<SuggestionGroup, string> = {
  people: "bg-[#EFEAFB] text-[#4B2E9A]",
  logic: "bg-[#FDECEA] text-[#9B1C1C]",
  objections: "bg-[#FFF4DE] text-[#8A5200]",
  evidence: "bg-[#E7F0FE] text-[#1D4ED8]",
  wording: "bg-[#E8F4EC] text-[#1F5F3B]",
  other: "bg-[#F1F2F4] text-[#3B404A]",
};

function groupOf(x: { kind: string; source: string }): SuggestionGroup {
  if (x.source === "member") return "people";
  if (["missing_link", "logical_fallacy", "disconnected_claim", "loose_end"].includes(x.kind)) return "logic";
  if (["unanswered_counter", "counter", "missing_perspective", "missing_stakeholder"].includes(x.kind)) return "objections";
  if (["evidence", "evidence_gap", "gap"].includes(x.kind)) return "evidence";
  if (["sharper", "sharper_wording"].includes(x.kind)) return "wording";
  return "other";
}

/** A reconstructed chain as numbered steps, with the gap called out. */
function ChainSteps({ chain }: { chain: string }) {
  const parts = chain.split(/(\[\s*Gap:[^\]]*\])/i).filter((p) => p.trim());
  const steps: { gap: boolean; text: string }[] = [];
  for (const p of parts) {
    const gap = /^\[\s*Gap:/i.test(p.trim());
    if (gap) {
      steps.push({ gap: true, text: p.trim().replace(/^\[\s*Gap:\s*/i, "").replace(/\]$/, "").trim() });
    } else {
      for (const sent of p.split(/(?<=[.?!])\s+/)) {
        const t = sent.trim();
        if (t) steps.push({ gap: false, text: t });
      }
    }
  }
  return (
    <ol className="m-0 list-none space-y-1 p-0">
      {steps.map((st, i) =>
        st.gap ? (
          <li key={i} className="rounded-md border border-dashed border-[#D92D20] bg-[#FEF3F2] px-2 py-1 text-[13px] text-[#9B1C1C]">
            <span className="font-semibold">Missing step: </span>
            {st.text}
          </li>
        ) : (
          <li key={i} className="flex gap-2 text-[13px] text-[#3B404A]">
            <span className="mt-[1px] text-[11px] font-bold text-muted">{i === 0 ? "1" : "so"}</span>
            <span>{st.text}</span>
          </li>
        ),
      )}
    </ol>
  );
}

/** why_weak can carry "Watch for:" and "Lenses:" parts; show each on its own. */
function splitWhy(raw: string | null | undefined): { main: string; watch: string; lenses: string[] } {
  const text = (raw ?? "").trim();
  if (!text) return { main: "", watch: "", lenses: [] };
  const li = text.search(/\s*Lenses:/);
  const beforeLenses = li >= 0 ? text.slice(0, li) : text;
  const lensText = li >= 0 ? text.slice(li).replace(/^\s*Lenses:\s*/, "") : "";
  const wi = beforeLenses.search(/\s*Watch for:/);
  const main = (wi >= 0 ? beforeLenses.slice(0, wi) : beforeLenses).trim();
  const watch = wi >= 0 ? beforeLenses.slice(wi).replace(/^\s*Watch for:\s*/, "").trim() : "";
  let lenses = lensText
    .split(/\n+-?\s*/)
    .map((x) => x.replace(/^-\s*/, "").trim())
    .filter(Boolean);
  // Older rows joined the lenses with spaces: split before each "Name:" heading.
  if (lenses.length === 1 && (lenses[0]!.match(/[A-Z][A-Za-z' ]{2,30}:/g)?.length ?? 0) > 1) {
    lenses = lenses[0]!.split(/\s+(?=[A-Z][A-Za-z' ]{2,30}:)/).map((x) => x.trim()).filter(Boolean);
  }
  return { main, watch, lenses };
}

function DetailBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="m-0 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{label}</p>
      <div className="mt-1 text-[13px] leading-relaxed">{children}</div>
    </div>
  );
}

const CROSS_REASONS = ["Already covered", "We disagree", "Not for this case"];

function SuggestionCard({
  s,
  caseId,
  teamId,
  sectionLabel,
  busy,
  reason,
  onReason,
  onTick,
  onCross,
  onResearch,
}: {
  s: Hub["suggestions"][number];
  caseId: string;
  teamId: string;
  sectionLabel: string | null;
  busy: boolean;
  reason: string;
  onReason: (v: string) => void;
  onTick: () => void;
  onCross: () => void;
  onResearch?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [crossing, setCrossing] = useState(false);
  const structured = Boolean(s.stronger_version);
  const fromMember = s.source === "member" && s.created_by_name;
  const group = groupOf(s);
  const kindLabel = s.fallacy_name ? `Fallacy: ${s.fallacy_name}` : (KIND_LABEL[s.kind] ?? "Suggestion");
  const who = fromMember ? s.created_by_name : s.source === "cruxy" ? "Cruxy" : s.source === "member" ? "Teammate" : "Evidence Library";
  // The one line a reader needs first: what is wrong, or the idea itself.
  // Older researched ideas packed everything into text; keep only their lead.
  const packed = fromMember && structured && /idea, researched/i.test(s.text) && !/:\s*"/.test(s.text);
  let headline = packed ? s.text.split(":")[0] : fromMember ? s.text : (s.weak_spot || s.text);
  // Cruxy writes "quoted words": what is wrong. Show the problem first, the quote small.
  let quoted: string | null = null;
  const qm = !fromMember ? headline.match(/^\s*["\u201c]([\s\S]{3,}?)["\u201d]\s*:\s*([\s\S]+)$/) : null;
  if (qm) {
    quoted = qm[1]!.trim();
    headline = qm[2]!.trim();
  }
  const why = splitWhy(s.why_weak);
  if (packed && !why.watch) {
    const m = s.text.match(/Watch for:\s*([\s\S]*?)(?:\s+[^.?!]*\?\s*What do you think\?\s*)?$/);
    if (m?.[1]) why.watch = m[1].trim();
  }
  const hasDetails = Boolean(
    s.logic_chain || s.why_weak || s.question_back || s.research_sources?.length || s.citation || (structured && (s.stronger_version?.length ?? 0) > 220),
  );
  return (
    <li className="rounded-[14px] border border-[#E6E8EC] bg-white px-3.5 py-3 shadow-[0_1px_0_rgba(17,19,24,0.03)]">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", GROUP_TONE[group])}>{kindLabel}</span>
        {sectionLabel ? (
          <span className="rounded-full bg-[#F1F2F4] px-2 py-0.5 text-[11px] font-semibold text-[#3B404A]">{sectionLabel}</span>
        ) : null}
        {s.source !== "cruxy" ? <span className="text-[11px] text-muted">from {who}</span> : null}
      </div>

      <p className={cn("m-0 mt-2 text-[14px] font-medium leading-snug text-ink", !open && "line-clamp-3")}>
        <LinkedText text={headline} caseId={caseId} />
      </p>
      {quoted ? (
        <p className={cn("m-0 mt-1 border-l-2 border-[#D5D8DE] pl-2 text-[12px] italic text-muted", !open && "line-clamp-1")}>
          {quoted}
        </p>
      ) : null}

      {structured ? (
        <div className="mt-2 rounded-lg border-l-[3px] border-[#1F7A4D] bg-[#F6FAF7] px-2.5 py-1.5">
          <p className="m-0 text-[11px] font-bold uppercase tracking-[0.08em] text-[#1F7A4D]">
            {fromMember ? "Suggested wording" : "Suggested fix"}
          </p>
          <p className={cn("m-0 mt-0.5 text-[13px] leading-relaxed text-ink", !open && "line-clamp-4")}>{s.stronger_version}</p>
        </div>
      ) : fromMember && onResearch ? (
        <button
          type="button"
          disabled={busy}
          className="mt-2 rounded-lg border border-mist bg-white px-2.5 py-1 text-xs font-semibold text-cardinal disabled:opacity-60"
          onClick={onResearch}
        >
          {busy ? "Researching..." : "Research and draft it"}
        </button>
      ) : null}

      {open ? (
        <div className="mt-3 flex flex-col gap-3 border-t border-[#ECEEF1] pt-3">
          {s.logic_chain ? (
            <DetailBlock label="The chain, step by step">
              <ChainSteps chain={s.logic_chain} />
            </DetailBlock>
          ) : null}
          {why.main ? (
            <DetailBlock label={fromMember ? "Where it fits" : "Why a judge would push here"}>{why.main}</DetailBlock>
          ) : null}
          {why.watch ? <DetailBlock label="Watch for">{why.watch}</DetailBlock> : null}
          {why.lenses.length ? (
            <DetailBlock label="Lenses">
              <ul className="m-0 list-none space-y-1 p-0">
                {why.lenses.map((l) => {
                  const i = l.indexOf(":");
                  return (
                    <li key={l}>
                      {i > 0 && i < 40 ? (
                        <>
                          <span className="font-semibold">{l.slice(0, i)}:</span>
                          {l.slice(i + 1)}
                        </>
                      ) : (
                        l
                      )}
                    </li>
                  );
                })}
              </ul>
            </DetailBlock>
          ) : null}
          {s.question_back ? (
            <DetailBlock label="Ask yourself">
              <span className="italic text-[#3B404A]">{s.question_back}</span>
            </DetailBlock>
          ) : null}
          {s.research_sources?.length ? (
            <DetailBlock label="What Cruxy read">
              <ul className="m-0 list-none space-y-1.5 p-0">
                {s.research_sources.map((r) => (
                  <li key={r.title}>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer" className="font-semibold text-cardinal underline">
                        {r.title}
                      </a>
                    ) : (
                      <span className="font-semibold">{r.title}</span>
                    )}
                    {r.why ? <span className="block text-muted">{r.why}</span> : null}
                  </li>
                ))}
              </ul>
            </DetailBlock>
          ) : s.citation ? (
            <DetailBlock label="Source">{s.citation}</DetailBlock>
          ) : null}
          <Attr name={who} when={s.created_at_label} />
          <ThreadInline
            caseId={caseId}
            teamId={teamId}
            kind="suggestion"
            targetId={s.id}
            title={(s.stronger_version ?? s.text).slice(0, 80)}
          />
        </div>
      ) : null}

      {crossing ? (
        <div className="mt-3 rounded-lg bg-[#F7F8FA] p-2">
          <p className="m-0 text-[12px] font-semibold text-[#3B404A]">Why set it aside? (optional)</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {CROSS_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onReason(reason === r ? "" : r)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[12px]",
                  reason === r ? "bg-ink text-white" : "border border-mist bg-white text-[#3B404A]",
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <input
            className="mt-1.5 h-9 w-full rounded-lg border border-mist bg-white px-2 text-xs"
            placeholder="Or your own reason"
            maxLength={40}
            value={CROSS_REASONS.includes(reason) ? "" : reason}
            disabled={busy}
            onChange={(e) => onReason(e.target.value)}
            aria-label="Reason to cross"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy}
              aria-label="Cross suggestion"
              className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              onClick={onCross}
            >
              Set aside
            </button>
            <button type="button" className="text-xs text-muted underline" onClick={() => setCrossing(false)}>
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            aria-label="Take suggestion"
            className="min-h-9 rounded-lg bg-ink px-3.5 text-xs font-semibold text-white disabled:opacity-60"
            onClick={onTick}
          >
            Take
          </button>
          <button
            type="button"
            disabled={busy}
            className="min-h-9 rounded-lg border border-mist bg-white px-3 text-xs font-semibold disabled:opacity-60"
            onClick={() => setCrossing(true)}
          >
            Cross
          </button>
          {hasDetails || !open ? (
            <button
              type="button"
              aria-expanded={open}
              className="ml-auto text-xs font-semibold text-cardinal"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? "Less" : "Details"}
            </button>
          ) : null}
        </div>
      )}
    </li>
  );
}

function ImportedBody({
  caseId,
  data,
  marksFor,
  onHighlight,
  onComment,
}: {
  caseId: string;
  data: Hub;
  marksFor: (kind: "passage" | "section", id: string) => ReadingMark[];
  onHighlight: (text: string, passageId: string) => Promise<boolean>;
  onComment: (
    text: string,
    passageId: string,
    body: string,
  ) => Promise<boolean>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-[20px] bg-white p-5">
        <h2 className="font-display m-0 text-xl font-extrabold">
          {data.brief.drive_title ?? "Imported document"}
        </h2>
        <p className="mt-1 text-sm text-muted">
          Read-only source text for this case.
          {data.brief.last_synced_label
            ? ` Last read ${data.brief.last_synced_label}.`
            : ""}
        </p>
      </section>
      {data.passages.length === 0 ? (
        <p className="text-sm text-muted">No paragraphs for this case yet.</p>
      ) : (
        data.passages.map((p) => (
          <article key={p.id} className="rounded-[20px] bg-white p-5">
            <AnnotateSurface
              resolvePassageId={(el) =>
                (el.closest("[data-passage-id]") as HTMLElement | null)?.dataset
                  .passageId ?? null
              }
              onHighlight={onHighlight}
              onComment={onComment}
            >
              <p
                className="m-0 whitespace-pre-wrap text-[15px] leading-relaxed"
                data-passage-id={p.id}
                style={{
                  fontFamily: "var(--font-source-serif), Georgia, serif",
                }}
              >
                {renderMarkedText(p.text, marksFor("passage", p.id), caseId)}
              </p>
            </AnnotateSurface>
          </article>
        ))
      )}
    </div>
  );
}

function CruxBody({
  caseId,
  data,
  marksFor,
  onHighlight,
  onComment,
  busy,
  sectionDrafts,
  setSectionDrafts,
  socraticAnswers,
  setSocraticAnswers,
  onSave,
  onAsk,
  onAnswer,
}: {
  caseId: string;
  data: Hub;
  marksFor: (kind: "passage" | "section", id: string) => ReadingMark[];
  onHighlight: (text: string, sectionKey: string) => Promise<boolean>;
  onComment: (
    text: string,
    sectionKey: string,
    body: string,
  ) => Promise<boolean>;
  busy: boolean;
  sectionDrafts: Record<string, string>;
  setSectionDrafts: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
  socraticAnswers: Record<string, string>;
  setSocraticAnswers: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
  onSave: (key: string) => void;
  onAsk: (key: string) => void;
  onAnswer: (key: string, socraticId: string) => void;
}) {
  // One view per section: read (highlight, right click) or edit, never both.
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-[20px] bg-white p-5">
        <h2 className="font-display m-0 text-[28px] font-extrabold leading-tight">
          Working document
        </h2>
        <p className="mt-1 text-sm text-muted">
          Read and highlight here, or press Edit on a section. Suggestions stay
          on the right.
        </p>
      </section>

      {data.sections.map((sec) => {
        const empty = !(sectionDrafts[sec.key] ?? "").trim();
        const isEditing = editing === sec.key || !sec.body.trim();
        return (
          <section key={sec.key} className="rounded-[20px] bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display m-0 text-lg font-extrabold">
                {sec.label}
              </h3>
              <Attr name={sec.updated_by_name} when={sec.updated_at_label} />
            </div>

            {empty && sec.socratic ? (
              <div className="mt-3 rounded-[14px] bg-[#F7F8FA] px-3.5 py-3">
                <p className="m-0 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                  Cruxy asks
                </p>
                <p className="m-0 mt-1 text-sm font-semibold leading-snug">
                  {sec.socratic.question}
                </p>
                <textarea
                  rows={3}
                  className="mt-2 w-full rounded-[10px] border border-mist bg-white px-3 py-2 text-sm"
                  placeholder="Your answer"
                  value={socraticAnswers[sec.key] ?? ""}
                  disabled={busy}
                  onChange={(e) =>
                    setSocraticAnswers((m) => ({
                      ...m,
                      [sec.key]: e.target.value,
                    }))
                  }
                />
                <button
                  type="button"
                  disabled={busy || !(socraticAnswers[sec.key] ?? "").trim()}
                  className="mt-2 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  onClick={() => onAnswer(sec.key, sec.socratic!.id)}
                >
                  Save answer
                </button>
              </div>
            ) : null}

            {empty && !sec.socratic ? (
              <button
                type="button"
                disabled={busy}
                className="mt-3 rounded-xl border border-mist bg-[#F7F8FA] px-4 py-2 text-sm font-semibold disabled:opacity-60"
                onClick={() => onAsk(sec.key)}
              >
                Ask Cruxy one question
              </button>
            ) : null}

            {!isEditing ? (
              <AnnotateSurface
                className="mt-3"
                resolvePassageId={(el) =>
                  (el.closest("[data-passage-id]") as HTMLElement | null)
                    ?.dataset.passageId ?? null
                }
                onHighlight={onHighlight}
                onComment={onComment}
              >
                <div
                  className="rounded-[10px] bg-[#F7F8FA] px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
                  data-passage-id={sec.key}
                  style={{
                    fontFamily: "var(--font-source-serif), Georgia, serif",
                  }}
                >
                  {renderMarkedText(
                    sectionDrafts[sec.key] ?? "",
                    marksFor("section", sec.key),
                    caseId,
                  )}
                </div>
              </AnnotateSurface>
            ) : null}

            {!isEditing ? (
              <button
                type="button"
                disabled={busy}
                className="mt-2 rounded-xl border border-mist bg-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
                onClick={() => setEditing(sec.key)}
              >
                Edit
              </button>
            ) : (
              <>
                <textarea
                  rows={empty ? 3 : 5}
                  className={cn(
                    "mt-3 w-full rounded-[10px] border border-mist px-3 py-2 text-sm",
                    empty && sec.socratic ? "opacity-70" : "",
                  )}
                  value={sectionDrafts[sec.key] ?? ""}
                  disabled={busy}
                  onChange={(e) =>
                    setSectionDrafts((m) => ({
                      ...m,
                      [sec.key]: e.target.value,
                    }))
                  }
                  placeholder={
                    empty
                      ? "Write here, or answer Cruxy's question above."
                      : undefined
                  }
                />
                <button
                  type="button"
                  disabled={busy}
                  className="mt-2 rounded-xl border border-mist bg-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
                  onClick={() => {
                    onSave(sec.key);
                    setEditing(null);
                  }}
                >
                  Save section
                </button>
                {editing === sec.key ? (
                  <button
                    type="button"
                    disabled={busy}
                    className="ml-2 mt-2 rounded-xl px-3 py-2 text-sm font-semibold text-muted underline disabled:opacity-60"
                    onClick={() => {
                      setSectionDrafts((m) => ({ ...m, [sec.key]: sec.body }));
                      setEditing(null);
                    }}
                  >
                    Cancel
                  </button>
                ) : null}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ChecklistPanel({
  caseId,
  teamId,
  data,
}: {
  caseId: string;
  teamId: string;
  data: Hub;
}) {
  const open = data.checklist.filter((c) => !c.done);
  const done = data.checklist.filter((c) => c.done);
  if (data.checklist.length === 0) return null;
  return (
    <section className="rounded-[20px] bg-white p-5">
      <h3 className="font-display m-0 text-lg font-extrabold">
        To-do for your doc
      </h3>
      <p className="mt-1 text-sm text-muted">
        Ticked suggestions wait here. Reply to disagree. Crux never edits your
        Google Doc.
      </p>
      <ul className="mt-3 m-0 list-none space-y-2 p-0">
        {open.map((c) => (
          <li
            key={c.id}
            className="rounded-[14px] bg-[#F7F8FA] px-3.5 py-3 text-sm"
          >
            <p className="m-0 leading-snug">{c.text}</p>
            <Attr name={c.created_by_name} when={c.created_at_label} />
            <ThreadInline
              caseId={caseId}
              teamId={teamId}
              kind="suggestion"
              targetId={c.suggestion_id || c.id}
              title={c.text.slice(0, 80)}
            />
          </li>
        ))}
        {done.map((c) => (
          <li
            key={c.id}
            className="rounded-[14px] px-3.5 py-2 text-sm text-muted"
          >
            <span className="line-through">{c.text}</span>
            <Attr name={c.done_by_name} when={c.done_at_label} />
            <ThreadInline
              caseId={caseId}
              teamId={teamId}
              kind="suggestion"
              targetId={c.suggestion_id || c.id}
              title={c.text.slice(0, 80)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default WorkingDocument;
