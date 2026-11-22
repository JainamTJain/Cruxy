"use client";

import { useCallback, useEffect, useState } from "react";
import {
  discussionAnchorId,
  type DiscussionReply,
  type DiscussionThreadKind,
} from "@/lib/discussion/types";
import { cn } from "@/lib/utils";

type Person = { id: string; name: string };

type Props = {
  caseId: string;
  teamId: string;
  kind: DiscussionThreadKind;
  targetId: string;
  title?: string;
  className?: string;
  /** When true, start expanded (e.g. deep link). */
  startOpen?: boolean;
};

/**
 * Small reply count + inline thread under an annotation, suggestion or field.
 */
export function ThreadInline({
  caseId,
  teamId,
  kind,
  targetId,
  title,
  className,
  startOpen,
}: Props) {
  const [open, setOpen] = useState(Boolean(startOpen));
  const [count, setCount] = useState(0);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [replies, setReplies] = useState<DiscussionReply[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [suggest, setSuggest] = useState<Person[]>([]);

  const anchor = discussionAnchorId(kind, targetId);

  const refreshCount = useCallback(async () => {
    if (!caseId || !teamId) return;
    const res = await fetch(
      `/api/discussion/threads?caseId=${encodeURIComponent(caseId)}&teamId=${encodeURIComponent(teamId)}`,
    );
    if (!res.ok) return;
    const data = (await res.json()) as {
      threads?: Array<{
        id: string;
        kind: string;
        target_id: string;
        reply_count: number;
      }>;
    };
    const hit = (data.threads ?? []).find(
      (t) => t.kind === kind && t.target_id === targetId,
    );
    if (hit) {
      setThreadId(hit.id);
      setCount(hit.reply_count);
    }
  }, [caseId, teamId, kind, targetId]);

  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      setBusy(true);
      setStatus(null);
      try {
        let id = threadId;
        if (!id) {
          const created = await fetch("/api/discussion/threads", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              caseId,
              teamId,
              kind,
              targetId,
              title: title ?? "",
            }),
          });
          if (!created.ok) {
            const err = (await created.json().catch(() => ({}))) as {
              error?: string;
            };
            setStatus(err.error ?? "Could not open thread.");
            return;
          }
          const json = (await created.json()) as { thread: { id: string } };
          id = json.thread.id;
          setThreadId(id);
        }
        const res = await fetch(`/api/discussion/threads/${id}`);
        if (!res.ok) {
          setStatus("Could not load replies.");
          return;
        }
        const data = (await res.json()) as {
          replies: DiscussionReply[];
          people: Person[];
        };
        setReplies(data.replies ?? []);
        setPeople(data.people ?? []);
        setCount((data.replies ?? []).length);
      } finally {
        setBusy(false);
      }
    })();
  }, [open, threadId, caseId, teamId, kind, targetId, title]);

  function onDraft(value: string) {
    setDraft(value);
    const at = value.lastIndexOf("@");
    if (at < 0) {
      setSuggest([]);
      return;
    }
    const partial = value.slice(at + 1);
    if (partial.includes(" ") || partial.length > 40) {
      setSuggest([]);
      return;
    }
    const q = partial.toLowerCase();
    setSuggest(
      people
        .filter((p) => p.name.toLowerCase().startsWith(q) || !q)
        .slice(0, 5),
    );
  }

  function pickMention(p: Person) {
    const at = draft.lastIndexOf("@");
    setDraft(
      at >= 0
        ? `${draft.slice(0, at)}@${p.name} `
        : `${draft}${draft ? " " : ""}@${p.name} `,
    );
    setSuggest([]);
  }

  async function send() {
    if (!draft.trim() || !threadId) return;
    setBusy(true);
    setStatus(null);
    try {
      const mentionIds = people
        .filter((p) =>
          draft.toLowerCase().includes(`@${p.name.toLowerCase()}`),
        )
        .map((p) => p.id);
      const res = await fetch(`/api/discussion/threads/${threadId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: draft, mentionIds }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus(err.error ?? "Could not send.");
        return;
      }
      const data = (await res.json()) as { reply: DiscussionReply };
      setReplies((prev) => [...prev, data.reply]);
      setCount((c) => c + 1);
      setDraft("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      id={anchor}
      className={cn("mt-2 scroll-mt-24", className)}
      data-discussion-kind={kind}
      data-discussion-target={targetId}
    >
      <button
        type="button"
        className="text-[12px] font-semibold text-cardinal underline"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {count > 0
          ? `${count} ${count === 1 ? "reply" : "replies"}`
          : "Reply"}
      </button>

      {open ? (
        <div className="mt-2 rounded-xl border border-mist bg-[#F7F8FA] px-3 py-2.5">
          {status ? (
            <p className="m-0 mb-2 text-xs text-cardinal">{status}</p>
          ) : null}
          <ul className="m-0 list-none space-y-2 p-0">
            {replies.map((r) => (
              <li key={r.id} className="text-sm">
                <p className="m-0 text-[11px] text-muted">
                  {r.person_name ?? "Someone"},{" "}
                  {new Date(r.created_at).toLocaleString()}
                </p>
                <p className="m-0 mt-0.5 whitespace-pre-wrap">{r.body}</p>
              </li>
            ))}
            {!replies.length && !busy ? (
              <li className="text-xs text-muted">
                No replies yet. Write the first note or @mention a teammate.
              </li>
            ) : null}
          </ul>

          <div className="relative mt-2">
            {suggest.length ? (
              <ul className="absolute bottom-full left-0 right-0 z-10 mb-1 max-h-32 list-none overflow-y-auto rounded-lg border border-mist bg-white p-1 shadow-sm">
                {suggest.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-[#F7F8FA]"
                      onClick={() => pickMention(p)}
                    >
                      @{p.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex gap-2">
              <input
                className="h-9 min-w-0 flex-1 rounded-lg border border-mist bg-white px-2 text-sm"
                value={draft}
                disabled={busy}
                placeholder="Reply… type @ to mention"
                onChange={(e) => onDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <button
                type="button"
                disabled={busy || !draft.trim()}
                className="rounded-lg bg-ink px-3 text-xs font-semibold text-white disabled:opacity-50"
                onClick={() => void send()}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
