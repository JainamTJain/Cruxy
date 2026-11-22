"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  discussionAnchorId,
  discussionHref,
  type DiscussionCatchUp,
  type DiscussionThread,
} from "@/lib/discussion/types";
import { cn } from "@/lib/utils";

type TeamOpt = { id: string; name: string };

type Props = {
  caseId: string;
  teamId: string;
  open: boolean;
  onClose: () => void;
  onJump?: (kind: string, targetId: string, tab: string) => void;
  className?: string;
};

function kindLabel(kind: string): string {
  if (kind === "annotation") return "On the case text";
  if (kind === "suggestion") return "Working document";
  if (kind === "one_pager_field") return "One pager";
  if (kind === "general") return "General";
  return "Thread";
}

function tabForKind(kind: string): string {
  if (kind === "suggestion") return "working";
  if (kind === "one_pager_field") return "one_pager";
  return "reading";
}

/**
 * Side panel: every thread on this case (own team), newest first, plus Catch me up.
 */
export function DiscussionPanel({
  caseId,
  teamId: initialTeamId,
  open,
  onClose,
  onJump,
  className,
}: Props) {
  const [teamId, setTeamId] = useState(initialTeamId);
  const [threads, setThreads] = useState<DiscussionThread[]>([]);
  const [teams, setTeams] = useState<TeamOpt[]>([]);
  const [canSwitch, setCanSwitch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catchUp, setCatchUp] = useState<DiscussionCatchUp | null>(null);
  const [generalDraft, setGeneralDraft] = useState("");
  const [generalId, setGeneralId] = useState<string | null>(null);

  useEffect(() => {
    setTeamId(initialTeamId);
  }, [initialTeamId]);

  const load = useCallback(async (tid: string) => {
    if (!caseId || !tid) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/discussion/threads?caseId=${encodeURIComponent(caseId)}&teamId=${encodeURIComponent(tid)}`,
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setError(err.error ?? "Could not load discussion.");
        return;
      }
      const data = (await res.json()) as {
        threads: DiscussionThread[];
        teams: TeamOpt[];
        canSwitchTeam: boolean;
      };
      setThreads(data.threads ?? []);
      setTeams(data.teams ?? []);
      setCanSwitch(Boolean(data.canSwitchTeam));
      const general = (data.threads ?? []).find((t) => t.kind === "general");
      setGeneralId(general?.id ?? null);
      void fetch("/api/discussion/visit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseId, teamId: tid }),
      });
    } finally {
      setBusy(false);
    }
  }, [caseId]);

  useEffect(() => {
    if (open) void load(teamId);
  }, [open, teamId, load]);

  async function runCatchUp() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/discussion/catch-up", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseId, teamId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setError(err.error ?? "Could not catch you up.");
        return;
      }
      setCatchUp((await res.json()) as DiscussionCatchUp);
      await load(teamId);
    } finally {
      setBusy(false);
    }
  }

  async function sendGeneral() {
    if (!generalDraft.trim()) return;
    setBusy(true);
    try {
      let id = generalId;
      if (!id) {
        const created = await fetch("/api/discussion/threads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            caseId,
            teamId,
            kind: "general",
            targetId: "general",
            title: "General",
          }),
        });
        if (!created.ok) return;
        id = ((await created.json()) as { thread: { id: string } }).thread.id;
        setGeneralId(id);
      }
      const res = await fetch(`/api/discussion/threads/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: generalDraft }),
      });
      if (!res.ok) return;
      setGeneralDraft("");
      await load(teamId);
    } finally {
      setBusy(false);
    }
  }

  function jump(t: DiscussionThread) {
    const tab = tabForKind(t.kind);
    onJump?.(t.kind, t.target_id, tab);
    const el = document.getElementById(
      discussionAnchorId(t.kind, t.target_id),
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-cardinal");
      window.setTimeout(() => el.classList.remove("ring-2", "ring-cardinal"), 1600);
    }
  }

  if (!open) return null;

  return (
    <aside
      className={cn(
        "flex w-full flex-col gap-3 rounded-[20px] bg-white p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:w-[320px] lg:overflow-y-auto",
        className,
      )}
      aria-label="Discussion"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="m-0 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
            Discussion
          </p>
          <h2 className="font-display m-0 text-lg font-extrabold">
            This case
          </h2>
        </div>
        <button
          type="button"
          className="text-sm text-muted underline"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      {canSwitch && teams.length > 1 ? (
        <label className="text-[11px] font-semibold text-muted">
          Team
          <select
            className="mt-1 w-full rounded-lg border border-mist px-2 py-2 text-sm"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <button
        type="button"
        disabled={busy}
        className="rounded-xl bg-ink px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        onClick={() => void runCatchUp()}
      >
        Catch me up
      </button>

      {catchUp ? (
        <div className="rounded-xl bg-[#F7F8FA] px-3 py-2.5 text-sm">
          <p className="m-0 whitespace-pre-wrap">{catchUp.summary}</p>
          {catchUp.decided.length ? (
            <div className="mt-2">
              <p className="m-0 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
                Decided
              </p>
              <ul className="mt-1 m-0 list-none space-y-1 p-0">
                {catchUp.decided.map((d) => (
                  <li key={d.threadId}>
                    <Link
                      href={d.href}
                      className="text-cardinal underline"
                      onClick={(e) => {
                        e.preventDefault();
                        const t = threads.find((x) => x.id === d.threadId);
                        if (t) jump(t);
                      }}
                    >
                      {d.text}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {catchUp.open.length ? (
            <div className="mt-2">
              <p className="m-0 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
                Still open
              </p>
              <ul className="mt-1 m-0 list-none space-y-1 p-0">
                {catchUp.open.map((d) => (
                  <li key={d.threadId}>
                    <Link
                      href={d.href}
                      className="text-cardinal underline"
                      onClick={(e) => {
                        e.preventDefault();
                        const t = threads.find((x) => x.id === d.threadId);
                        if (t) jump(t);
                      }}
                    >
                      {d.text}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="m-0 text-sm text-cardinal">{error}</p>
      ) : null}

      <ul className="m-0 list-none space-y-2 p-0">
        {threads.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              className="w-full rounded-xl bg-[#F7F8FA] px-3 py-2.5 text-left hover:bg-[#ECEEF1]"
              onClick={() => jump(t)}
            >
              <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                {kindLabel(t.kind)}
                {t.reply_count
                  ? ` · ${t.reply_count} ${t.reply_count === 1 ? "reply" : "replies"}`
                  : ""}
              </span>
              <span className="mt-0.5 block text-sm font-semibold">
                {t.title || "Thread"}
              </span>
              {t.last_body_preview ? (
                <span className="mt-0.5 block text-xs text-muted line-clamp-2">
                  {t.last_body_preview}
                </span>
              ) : (
                <span className="mt-0.5 block text-xs text-muted">
                  No replies yet. Tap to open.
                </span>
              )}
            </button>
            <Link
              href={discussionHref({
                caseId,
                teamId,
                kind: t.kind,
                targetId: t.target_id,
                threadId: t.id,
              })}
              className="mt-1 inline-block text-[11px] text-muted underline"
            >
              Jump to where this lives
            </Link>
          </li>
        ))}
        {!threads.length && !busy ? (
          <li className="text-sm text-muted">
            No threads yet. Reply under a note, suggestion or one-pager field,
            or write in General below.
          </li>
        ) : null}
      </ul>

      <div className="mt-auto border-t border-mist pt-3">
        <p className="m-0 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
          General for this case
        </p>
        <div className="mt-2 flex gap-2">
          <input
            className="h-9 min-w-0 flex-1 rounded-lg border border-mist px-2 text-sm"
            value={generalDraft}
            disabled={busy}
            placeholder="Say something to the team…"
            onChange={(e) => setGeneralDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void sendGeneral();
              }
            }}
          />
          <button
            type="button"
            disabled={busy || !generalDraft.trim()}
            className="rounded-lg bg-ink px-3 text-xs font-semibold text-white disabled:opacity-50"
            onClick={() => void sendGeneral()}
          >
            Send
          </button>
        </div>
      </div>
    </aside>
  );
}
