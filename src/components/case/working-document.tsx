"use client";

/**
 * Working document tab. F renders this on the case page with caseId + teamId.
 * Builds on Team Brief: import Google Doc or write section by section in Crux.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { LoadingGenie } from "@/components/cruxy/mood/loading-genie";
import { cn } from "@/lib/utils";

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
  }>;
  checklist: Array<{
    id: string;
    text: string;
    kind: string;
    done: boolean;
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

const KIND_LABEL: Record<string, string> = {
  evidence: "Evidence Library",
  gap: "Gap",
  counter: "Counterargument",
  sharper: "Sharper claim",
  question: "Question",
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
  ideaDraft,
  setIdeaDraft,
  onTellIdea,
  onCoherence,
}: {
  busy: boolean;
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
        Cruxy writes it up as a suggestion with your name for the team to tick
        or cross. Strong ideas may also reach other teams anonymously.
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
          Add as suggestion
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
}: {
  caseId: string;
  teamId: string;
}) {
  const [data, setData] = useState<Hub | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [driveUrl, setDriveUrl] = useState("");
  const [factText, setFactText] = useState("");
  const [factCite, setFactCite] = useState("");
  const [crossReasons, setCrossReasons] = useState<Record<string, string>>({});
  const [sectionDrafts, setSectionDrafts] = useState<Record<string, string>>(
    {},
  );
  const [socraticAnswers, setSocraticAnswers] = useState<
    Record<string, string>
  >({});
  const [ideaDraft, setIdeaDraft] = useState("");

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
  }, [caseId, teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/case/working-document", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseId, teamId, ...body }),
      });
      const json = (await res.json()) as Hub & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Could not save.");
        return false;
      }
      setData(json);
      const drafts: Record<string, string> = {};
      for (const s of json.sections) drafts[s.key] = s.body;
      setSectionDrafts(drafts);
      return true;
    } finally {
      setBusy(false);
    }
  }

  const suggestionsByAnchor = useMemo(() => {
    const map = new Map<string, Hub["suggestions"]>();
    if (!data) return map;
    for (const s of data.suggestions) {
      const key = s.paragraph_anchor ?? "_doc";
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    return map;
  }, [data]);

  if (!data) {
    if (error) return <p className="text-sm text-cardinal">{error}</p>;
    return <LoadingGenie label="Loading working document..." />;
  }

  const path = data.brief.working_path;
  const canEdit = data.canEdit !== false;
  const editBusy = busy || !canEdit;

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p className="rounded-xl border border-cardinal/30 bg-cardinal/5 px-3 py-2 text-sm text-cardinal">
          {error}
        </p>
      ) : null}

      {!canEdit ? (
        <p className="m-0 rounded-xl bg-[#F7F8FA] px-3.5 py-2 text-sm text-muted">
          Read only. Only Dr. B and Jainam can open another team&apos;s document.
        </p>
      ) : null}

      {path && canEdit ? (
        <IdeaAndCoherenceBar
          busy={editBusy}
          ideaDraft={ideaDraft}
          setIdeaDraft={setIdeaDraft}
          onTellIdea={() =>
            void post({
              action: "tell_idea",
              text: ideaDraft.trim(),
            }).then((ok) => {
              if (ok) setIdeaDraft("");
            })
          }
          onCoherence={() => void post({ action: "coherence_check" })}
        />
      ) : null}

      {!path ? (
        <EmptyChoice
          busy={editBusy}
          driveUrl={driveUrl}
          setDriveUrl={setDriveUrl}
          onImport={() =>
            void post({ action: "import_doc", driveUrl: driveUrl.trim() })
          }
          onStart={() => void post({ action: "start_crux" })}
        />
      ) : null}

      {path === "imported" ? (
        <ImportedDoc
          data={data}
          busy={editBusy}
          suggestionsByAnchor={suggestionsByAnchor}
          crossReasons={crossReasons}
          setCrossReasons={setCrossReasons}
          onTick={(id) => void post({ action: "tick_suggestion", suggestionId: id })}
          onCross={(id) =>
            void post({
              action: "cross_suggestion",
              suggestionId: id,
              reason: crossReasons[id] || null,
            })
          }
        />
      ) : null}

      {path === "crux" ? (
        <CruxDoc
          data={data}
          busy={editBusy}
          sectionDrafts={sectionDrafts}
          setSectionDrafts={setSectionDrafts}
          socraticAnswers={socraticAnswers}
          setSocraticAnswers={setSocraticAnswers}
          crossReasons={crossReasons}
          setCrossReasons={setCrossReasons}
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
          onTick={(id) => void post({ action: "tick_suggestion", suggestionId: id })}
          onCross={(id) =>
            void post({
              action: "cross_suggestion",
              suggestionId: id,
              reason: crossReasons[id] || null,
            })
          }
        />
      ) : null}

      {path ? (
        <>
          <ChecklistPanel data={data} />
          <EvidenceLibraryPanel
            data={data}
            busy={editBusy}
            factText={factText}
            setFactText={setFactText}
            factCite={factCite}
            setFactCite={setFactCite}
            crossReasons={crossReasons}
            setCrossReasons={setCrossReasons}
            onSuggest={() =>
              void post({
                action: "suggest_fact",
                text: factText,
                citation: factCite,
              }).then((ok) => {
                if (ok) {
                  setFactText("");
                  setFactCite("");
                }
              })
            }
            onDecide={(truthItemId, decision) =>
              void post({
                action: "decide_library",
                truthItemId,
                decision,
                reason: crossReasons[truthItemId] || null,
              })
            }
          />
        </>
      ) : null}
    </div>
  );
}

function EmptyChoice({
  busy,
  driveUrl,
  setDriveUrl,
  onImport,
  onStart,
}: {
  busy: boolean;
  driveUrl: string;
  setDriveUrl: (v: string) => void;
  onImport: () => void;
  onStart: () => void;
}) {
  return (
    <section className="rounded-[20px] bg-white p-5">
      <h2 className="font-display m-0 text-[28px] font-extrabold leading-tight sm:text-[36px]">
        Working document
      </h2>
      <p className="mt-2 text-sm text-muted">
        One place this team writes from for this case. Pick how you work. You
        can switch later.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[16px] border-2 border-mist bg-[#F7F8FA] p-4">
          <h3 className="font-display m-0 text-lg font-extrabold">
            Import our Google Doc
          </h3>
          <p className="mt-1 text-[13px] leading-snug text-[#3B404A]">
            Crux reads it on sync and never writes to it. Suggestions land in
            your to-do list.
          </p>
          <input
            type="url"
            className="mt-3 h-10 w-full rounded-[10px] border border-mist bg-white px-3 text-sm"
            placeholder="https://docs.google.com/document/d/…"
            value={driveUrl}
            disabled={busy}
            onChange={(e) => setDriveUrl(e.target.value)}
          />
          <button
            type="button"
            disabled={busy || !driveUrl.trim()}
            className="mt-3 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            onClick={onImport}
          >
            Import our Google Doc
          </button>
        </div>
        <div className="rounded-[16px] border-2 border-mist bg-[#F7F8FA] p-4">
          <h3 className="font-display m-0 text-lg font-extrabold">
            Start our working document here
          </h3>
          <p className="mt-1 text-[13px] leading-snug text-[#3B404A]">
            Build it section by section. Cruxy asks one question at a time
            before it answers.
          </p>
          <button
            type="button"
            disabled={busy}
            className="mt-3 rounded-xl bg-cardinal px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            onClick={onStart}
          >
            Start our working document here
          </button>
        </div>
      </div>
    </section>
  );
}

function SuggestionCard({
  s,
  busy,
  reason,
  onReason,
  onTick,
  onCross,
}: {
  s: Hub["suggestions"][number];
  busy: boolean;
  reason: string;
  onReason: (v: string) => void;
  onTick: () => void;
  onCross: () => void;
}) {
  return (
    <li className="rounded-[12px] border border-mist bg-white px-3 py-2.5">
      <p className="m-0 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
        {KIND_LABEL[s.kind] ?? "Suggestion"}
        {s.source === "evidence_library" ? " · shared" : ""}
      </p>
      <p className="m-0 mt-1 text-sm leading-snug">{s.text}</p>
      {s.citation ? (
        <p className="m-0 mt-1 font-mono text-[11px] text-muted">{s.citation}</p>
      ) : null}
      <Attr name={s.created_by_name} when={s.created_at_label} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          aria-label="Tick: add to to-do list"
          className="rounded-lg bg-ink px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          onClick={onTick}
        >
          Tick
        </button>
        <input
          className="h-8 w-24 rounded-lg border border-mist px-2 text-xs"
          placeholder="Why not?"
          maxLength={40}
          value={reason}
          disabled={busy}
          onChange={(e) => onReason(e.target.value)}
          aria-label="Optional one-word reason to hide"
        />
        <button
          type="button"
          disabled={busy}
          aria-label="Cross: hide for this team"
          className="rounded-lg border border-mist bg-[#F7F8FA] px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60"
          onClick={onCross}
        >
          Cross
        </button>
      </div>
    </li>
  );
}

function ImportedDoc({
  data,
  busy,
  suggestionsByAnchor,
  crossReasons,
  setCrossReasons,
  onTick,
  onCross,
}: {
  data: Hub;
  busy: boolean;
  suggestionsByAnchor: Map<string, Hub["suggestions"]>;
  crossReasons: Record<string, string>;
  setCrossReasons: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onTick: (id: string) => void;
  onCross: (id: string) => void;
}) {
  const loose = suggestionsByAnchor.get("_doc") ?? [];
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-[20px] bg-white p-5">
        <h2 className="font-display m-0 text-xl font-extrabold">
          {data.brief.drive_title ?? "Your Google Doc"}
        </h2>
        <p className="mt-1 text-sm text-muted">
          Read-only. Crux never writes into this doc. Tick a suggestion to put
          it on your to-do list.
          {data.brief.last_synced_label
            ? ` Last read ${data.brief.last_synced_label}.`
            : ""}
        </p>
      </section>

      {data.passages.length === 0 ? (
        <p className="text-sm text-muted">
          No text yet. Link may still be syncing, or the doc was empty.
        </p>
      ) : (
        data.passages.map((p) => {
          const beside = suggestionsByAnchor.get(p.anchor) ?? [];
          return (
            <div
              key={p.id}
              className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,280px)]"
            >
              <article className="rounded-[20px] bg-white p-5">
                <p className="m-0 whitespace-pre-wrap text-[15px] leading-relaxed">
                  {p.text}
                </p>
              </article>
              <aside className="flex flex-col gap-2">
                <p className="m-0 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
                  Suggestions
                </p>
                {beside.length === 0 ? (
                  <p className="m-0 text-xs text-muted">None for this paragraph.</p>
                ) : (
                  <ul className="m-0 list-none space-y-2 p-0">
                    {beside.map((s) => (
                      <SuggestionCard
                        key={s.id}
                        s={s}
                        busy={busy}
                        reason={crossReasons[s.id] ?? ""}
                        onReason={(v) =>
                          setCrossReasons((m) => ({ ...m, [s.id]: v }))
                        }
                        onTick={() => onTick(s.id)}
                        onCross={() => onCross(s.id)}
                      />
                    ))}
                  </ul>
                )}
              </aside>
            </div>
          );
        })
      )}

      {loose.length > 0 ? (
        <section className="rounded-[20px] bg-white p-5">
          <h3 className="font-display m-0 text-lg font-extrabold">
            More suggestions
          </h3>
          <ul className="mt-3 m-0 list-none space-y-2 p-0 sm:max-w-md">
            {loose.map((s) => (
              <SuggestionCard
                key={s.id}
                s={s}
                busy={busy}
                reason={crossReasons[s.id] ?? ""}
                onReason={(v) =>
                  setCrossReasons((m) => ({ ...m, [s.id]: v }))
                }
                onTick={() => onTick(s.id)}
                onCross={() => onCross(s.id)}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function CruxDoc({
  data,
  busy,
  sectionDrafts,
  setSectionDrafts,
  socraticAnswers,
  setSocraticAnswers,
  crossReasons,
  setCrossReasons,
  onSave,
  onAsk,
  onAnswer,
  onTick,
  onCross,
}: {
  data: Hub;
  busy: boolean;
  sectionDrafts: Record<string, string>;
  setSectionDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  socraticAnswers: Record<string, string>;
  setSocraticAnswers: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
  crossReasons: Record<string, string>;
  setCrossReasons: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSave: (key: string) => void;
  onAsk: (key: string) => void;
  onAnswer: (key: string, socraticId: string) => void;
  onTick: (id: string) => void;
  onCross: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-[20px] bg-white p-5">
        <h2 className="font-display m-0 text-[28px] font-extrabold leading-tight">
          Working document
        </h2>
        <p className="mt-1 text-sm text-muted">
          Six sections. In an empty one, Cruxy asks one question at a time.
        </p>
      </section>

      {data.sections.map((sec) => {
        const empty = !(sectionDrafts[sec.key] ?? "").trim();
        const sectionSuggestions = data.suggestions.filter(
          (s) => s.section_key === sec.key,
        );
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

            <textarea
              rows={empty ? 3 : 5}
              className={cn(
                "mt-3 w-full rounded-[10px] border border-mist px-3 py-2 text-sm",
                empty && sec.socratic ? "opacity-70" : "",
              )}
              value={sectionDrafts[sec.key] ?? ""}
              disabled={busy}
              onChange={(e) =>
                setSectionDrafts((m) => ({ ...m, [sec.key]: e.target.value }))
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
              onClick={() => onSave(sec.key)}
            >
              Save section
            </button>

            {sectionSuggestions.length > 0 ? (
              <ul className="mt-3 m-0 list-none space-y-2 p-0 sm:max-w-md">
                {sectionSuggestions.map((s) => (
                  <SuggestionCard
                    key={s.id}
                    s={s}
                    busy={busy}
                    reason={crossReasons[s.id] ?? ""}
                    onReason={(v) =>
                      setCrossReasons((m) => ({ ...m, [s.id]: v }))
                    }
                    onTick={() => onTick(s.id)}
                    onCross={() => onCross(s.id)}
                  />
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function ChecklistPanel({ data }: { data: Hub }) {
  const open = data.checklist.filter((c) => !c.done);
  const done = data.checklist.filter((c) => c.done);
  if (data.checklist.length === 0) return null;
  return (
    <section className="rounded-[20px] bg-white p-5">
      <h3 className="font-display m-0 text-lg font-extrabold">
        To-do for your doc
      </h3>
      <p className="mt-1 text-sm text-muted">
        Ticked suggestions wait here. Crux never edits your Google Doc.
      </p>
      <ul className="mt-3 m-0 list-none space-y-2 p-0">
        {open.map((c) => (
          <li
            key={c.id}
            className="rounded-[14px] bg-[#F7F8FA] px-3.5 py-3 text-sm"
          >
            <p className="m-0 leading-snug">{c.text}</p>
            <Attr name={c.created_by_name} when={c.created_at_label} />
          </li>
        ))}
        {done.map((c) => (
          <li
            key={c.id}
            className="rounded-[14px] px-3.5 py-2 text-sm text-muted line-through"
          >
            {c.text}
            <Attr name={c.done_by_name} when={c.done_at_label} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function EvidenceLibraryPanel({
  data,
  busy,
  factText,
  setFactText,
  factCite,
  setFactCite,
  crossReasons,
  setCrossReasons,
  onSuggest,
  onDecide,
}: {
  data: Hub;
  busy: boolean;
  factText: string;
  setFactText: (v: string) => void;
  factCite: string;
  setFactCite: (v: string) => void;
  crossReasons: Record<string, string>;
  setCrossReasons: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSuggest: () => void;
  onDecide: (id: string, decision: "tick" | "cross") => void;
}) {
  const visible = data.library.filter((f) => f.decision !== "cross");
  return (
    <section className="rounded-[20px] bg-white p-5">
      <h3 className="font-display m-0 text-lg font-extrabold">
        Evidence Library
      </h3>
      <p className="mt-1 text-sm text-muted">
        Shared facts with citations. Tick or cross for your team only. One
        team&apos;s choice never changes another team&apos;s view.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input
          className="h-10 rounded-[10px] border border-mist px-3 text-sm"
          placeholder="Fact"
          value={factText}
          disabled={busy}
          onChange={(e) => setFactText(e.target.value)}
        />
        <input
          className="h-10 rounded-[10px] border border-mist px-3 text-sm"
          placeholder="Citation"
          value={factCite}
          disabled={busy}
          onChange={(e) => setFactCite(e.target.value)}
        />
        <button
          type="button"
          disabled={busy || !factText.trim() || !factCite.trim()}
          className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          onClick={onSuggest}
        >
          Suggest fact
        </button>
      </div>

      <ul className="mt-4 m-0 list-none space-y-2 p-0">
        {visible.length === 0 ? (
          <li className="text-sm text-muted">No shared facts yet for this case.</li>
        ) : (
          visible.map((f) => (
            <li
              key={f.id}
              className="flex flex-col gap-2 rounded-[14px] bg-[#F7F8FA] px-3.5 py-3 sm:flex-row sm:items-start"
            >
              <div className="min-w-0 flex-1">
                <p className="m-0 text-sm leading-snug">{f.text}</p>
                <Attr name={f.created_by_name} when={f.created_at_label} />
                {f.decision === "tick" ? (
                  <p className="m-0 mt-1 text-[12px] font-semibold text-[#0F7B6C]">
                    Your team ticked this
                    {f.decided_by_name ? ` (${f.decided_by_name})` : ""}.
                  </p>
                ) : null}
              </div>
              {f.decision !== "tick" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-lg bg-ink px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                    onClick={() => onDecide(f.id, "tick")}
                  >
                    Tick
                  </button>
                  <input
                    className="h-8 w-24 rounded-lg border border-mist px-2 text-xs"
                    placeholder="Why not?"
                    maxLength={40}
                    value={crossReasons[f.id] ?? ""}
                    disabled={busy}
                    onChange={(e) =>
                      setCrossReasons((m) => ({ ...m, [f.id]: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-lg border border-mist bg-white px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60"
                    onClick={() => onDecide(f.id, "cross")}
                  >
                    Cross
                  </button>
                </div>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

/** Default export alias for F's case page import. */
export default WorkingDocument;
