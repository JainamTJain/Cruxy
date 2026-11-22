"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type BriefMode = "own_doc" | "build_in_crux";

type BriefPayload = {
  brief: {
    id: string;
    mode: BriefMode;
    drive_file_id: string | null;
    drive_title: string | null;
    thesis: string | null;
    stance_version: number;
    confirmed_by: string[];
    drift_flag: boolean;
    drift_detail: string | null;
    last_synced_at: string | null;
  };
  checklist: Array<{
    id: string;
    text: string;
    kind: string;
    done: boolean;
  }>;
  libraryCandidates: Array<{
    id: string;
    team_id: string;
    text: string;
    citation: string | null;
    status: string;
  }>;
  confirmedNames: string[];
};

const KIND_LABEL: Record<string, string> = {
  suggestion: "Suggestion",
  evidence: "New evidence",
  question: "Cruxy's question",
  counter: "Counter-argument",
  inspired: "Inspired by another team",
};

export function TeamBriefPanel({
  caseId,
  teamId,
  canEdit,
  busy,
  onBusy,
  onError,
  onChanged,
}: {
  caseId: string;
  teamId: string;
  canEdit: boolean;
  busy: boolean;
  onBusy: (v: boolean) => void;
  onError: (msg: string | null) => void;
  onChanged?: () => void;
}) {
  const [data, setData] = useState<BriefPayload | null>(null);
  const [driveUrl, setDriveUrl] = useState("");
  const [thesisDraft, setThesisDraft] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/case-brain/brief?caseId=${encodeURIComponent(caseId)}&teamId=${encodeURIComponent(teamId)}`,
      );
      const json = (await res.json()) as BriefPayload & { error?: string };
      if (!res.ok) {
        onError(json.error ?? "Could not load the Team Brief.");
        return;
      }
      setData(json);
      setThesisDraft(json.brief.thesis ?? "");
    } finally {
      setLoading(false);
    }
  }, [caseId, teamId, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    onBusy(true);
    onError(null);
    try {
      const res = await fetch("/api/case-brain/brief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseId, teamId, ...body }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        onError(json.error ?? "Could not update the Brief.");
        return false;
      }
      await load();
      onChanged?.();
      return true;
    } finally {
      onBusy(false);
    }
  }

  if (loading && !data) {
    return (
      <p className="text-sm text-muted">Loading this team&apos;s Brief…</p>
    );
  }
  if (!data) return null;

  const { brief, checklist, libraryCandidates, confirmedNames } = data;
  const openChecklist = checklist.filter((c) => !c.done);
  const doneChecklist = checklist.filter((c) => c.done);

  return (
    <div className="flex flex-col gap-4">
      {/* Agreed stance bar */}
      <section
        className={cn(
          "rounded-[20px] p-5",
          brief.drift_flag
            ? "border-2 border-[#C62828] bg-[#FFEBEE]"
            : "bg-white",
        )}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display m-0 text-xl font-extrabold">
            Agreed stance
          </h2>
          {brief.stance_version > 0 ? (
            <span className="rounded-md bg-ink px-2 py-0.5 text-[12px] font-semibold text-white">
              v{brief.stance_version}
            </span>
          ) : null}
        </div>
        {brief.drift_flag ? (
          <p className="mt-2 text-sm font-semibold text-[#C62828]">
            Drift flagged
            {brief.drift_detail ? `: ${brief.drift_detail}` : "."} Check that
            notes and answers still match this thesis.
          </p>
        ) : null}
        {canEdit ? (
          <div className="mt-3 flex flex-col gap-2">
            <label htmlFor="stance-thesis" className="text-[13px] font-semibold">
              Thesis in plain words
            </label>
            <textarea
              id="stance-thesis"
              rows={2}
              className="rounded-[10px] border border-mist px-3 py-2 text-sm"
              value={thesisDraft}
              disabled={busy}
              onChange={(e) => setThesisDraft(e.target.value)}
              placeholder="What this team will argue for this case"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                onClick={() =>
                  void post({ action: "set_stance", thesis: thesisDraft })
                }
              >
                Save thesis
              </button>
              {brief.thesis ? (
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-xl border border-mist bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                  onClick={() => void post({ action: "confirm_stance" })}
                >
                  I confirm this stance
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm leading-snug">
            {brief.thesis?.trim() || "No agreed thesis yet."}
          </p>
        )}
        <p className="mt-2 text-[13px] text-muted">
          {confirmedNames.length
            ? `Confirmed by ${confirmedNames.join(", ")}.`
            : brief.thesis
              ? "No one has confirmed yet."
              : "Set a thesis so the team can confirm it."}
        </p>
      </section>

      {/* Mode picker */}
      <section className="rounded-[20px] bg-white p-5">
        <h2 className="font-display m-0 text-xl font-extrabold">Team Brief</h2>
        <p className="mt-1 text-sm text-muted">
          One Brief per team per case. Pick how this team works. You can switch
          later.
        </p>
        <div
          role="tablist"
          aria-label="Brief mode"
          className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2"
        >
          {(
            [
              {
                id: "own_doc" as const,
                title: "Our own doc",
                blurb:
                  "Link a Google Doc from the Ethics Bowl Drive folder. Crux reads it on every sync and never writes to it.",
              },
              {
                id: "build_in_crux" as const,
                title: "Build it in Crux",
                blurb:
                  "Use the claim map and one pager, drafted from the Evidence Library.",
              },
            ] as const
          ).map((opt) => {
            const selected = brief.mode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={selected}
                disabled={!canEdit || busy}
                onClick={() =>
                  void post({ action: "set_mode", mode: opt.id })
                }
                className={cn(
                  "rounded-[14px] border-2 px-4 py-3 text-left disabled:opacity-60",
                  selected
                    ? "border-cardinal bg-cardinal/5"
                    : "border-mist bg-[#F7F8FA]",
                )}
              >
                <span className="block text-sm font-bold">{opt.title}</span>
                <span className="mt-1 block text-[13px] leading-snug text-[#3B404A]">
                  {opt.blurb}
                </span>
              </button>
            );
          })}
        </div>

        {brief.mode === "own_doc" ? (
          <div className="mt-4 flex flex-col gap-2">
            {brief.drive_title || brief.drive_file_id ? (
              <p className="text-sm">
                Linked:{" "}
                <strong>{brief.drive_title ?? "Google Doc"}</strong>
                {brief.last_synced_at
                  ? `. Last read ${new Date(brief.last_synced_at).toLocaleString()}.`
                  : "."}{" "}
                Crux never writes to this doc.
              </p>
            ) : canEdit ? (
              <p className="text-sm text-muted">
                Paste a Google Doc link from the Ethics Bowl Drive folder.
              </p>
            ) : (
              <p className="text-sm text-muted">
                This team has not linked a Google Doc yet.
              </p>
            )}
            {canEdit ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="url"
                  className="h-[42px] min-w-0 flex-1 rounded-[10px] border border-mist px-3 text-sm"
                  placeholder="https://docs.google.com/document/d/…"
                  value={driveUrl}
                  disabled={busy}
                  onChange={(e) => setDriveUrl(e.target.value)}
                />
                <button
                  type="button"
                  disabled={busy || !driveUrl.trim()}
                  className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  onClick={() =>
                    void post({ action: "link_doc", driveUrl: driveUrl.trim() })
                  }
                >
                  Link and read
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">
            Open the Claim map and One pager tabs to build this Brief in Crux.
            Suggestions you accept land in the Evidence Library.
          </p>
        )}
      </section>

      {/* Own-doc checklist */}
      {brief.mode === "own_doc" && checklist.length > 0 ? (
        <section className="rounded-[20px] bg-white p-5">
          <h3 className="font-display m-0 text-lg font-extrabold">
            Checklist for your doc
          </h3>
          <p className="mt-1 text-sm text-muted">
            Accepted suggestions wait here until someone adds them to the
            Google Doc. Crux will not edit the doc for you.
          </p>
          <ul className="mt-3 m-0 list-none space-y-2 p-0">
            {openChecklist.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-start gap-2 rounded-[14px] bg-[#F7F8FA] px-3.5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                    {KIND_LABEL[item.kind] ?? "Suggestion"}
                  </span>
                  <p className="m-0 mt-1 text-sm leading-snug">{item.text}</p>
                </div>
                {canEdit ? (
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-xl border border-mist bg-white px-3 py-2 text-xs font-semibold"
                    onClick={() =>
                      void post({
                        action: "checklist_done",
                        checklistId: item.id,
                        done: true,
                      })
                    }
                  >
                    Mark done
                  </button>
                ) : null}
              </li>
            ))}
            {doneChecklist.map((item) => (
              <li
                key={item.id}
                className="rounded-[14px] px-3.5 py-2 text-sm text-muted line-through"
              >
                {item.text}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Library candidates from docs */}
      {libraryCandidates.length > 0 ? (
        <section className="rounded-[20px] bg-white p-5">
          <h3 className="font-display m-0 text-lg font-extrabold">
            Facts for the Evidence Library
          </h3>
          <p className="mt-1 text-sm text-muted">
            Cited facts found in a team&apos;s doc. Facts only, never a stance.
            Accept to share with every team.
          </p>
          <ul className="mt-3 m-0 list-none space-y-2 p-0">
            {libraryCandidates.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-2 rounded-[14px] bg-[#F7F8FA] px-3.5 py-3 sm:flex-row sm:items-start"
              >
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-sm leading-snug">{c.text}</p>
                  {c.citation ? (
                    <p className="m-0 mt-1 font-mono text-[12px] text-muted">
                      {c.citation}
                    </p>
                  ) : null}
                </div>
                {canEdit ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-xl border border-mist bg-white px-3 py-2 text-xs font-semibold"
                      onClick={() =>
                        void post({
                          action: "decide_candidate",
                          candidateId: c.id,
                          accept: true,
                        })
                      }
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-xl border border-mist bg-white px-3 py-2 text-xs font-semibold"
                      onClick={() =>
                        void post({
                          action: "decide_candidate",
                          candidateId: c.id,
                          accept: false,
                        })
                      }
                    >
                      Skip
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function suggestionKindFromOrigin(
  origin: string,
): "suggestion" | "evidence" | "question" | "counter" | "inspired" {
  if (origin === "inspired_by_team") return "inspired";
  if (origin === "research") return "evidence";
  if (origin === "transcript") return "suggestion";
  return "suggestion";
}
