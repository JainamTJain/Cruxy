"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Section = { key: string; label: string; body: string };
type CoachComment = {
  id: string;
  sectionKey: string | null;
  text: string;
  suggested: string | null;
  status: string;
  by: string | null;
  createdAt: string;
};
type TeamStance = {
  teamId: string;
  teamName: string;
  hasDocument: boolean;
  workingPath: string | null;
  sections: Section[];
  openSuggestions: number;
  coachComments: CoachComment[];
};
type Overview = { caseId: string; caseNumber: number; caseTitle: string; teams: TeamStance[] };
type Question = { id: string; text: string; status: string; origin: string | null; origin_label: string | null };
type Comparison = {
  teams: { team: string; stance: string; strongest: string; weakest: string }[];
  differences: string[];
  shared_gaps: string[];
  questions: string[];
};
type Draft = { teamIds: string[]; sectionKey: string | null; quote: string; comment: string; suggested: string };

const STATUS: Record<string, string> = { pending: "Waiting", ticked: "Taken", crossed: "Set aside" };

function Cell({ body }: { body: string }) {
  const [open, setOpen] = useState(false);
  if (!body) return <p className="m-0 text-sm italic text-muted">Nothing written yet.</p>;
  const long = body.length > 520;
  return (
    <div>
      <p className={cn("m-0 whitespace-pre-wrap text-sm leading-relaxed text-ink", !open && long && "line-clamp-[9]")}>
        {body}
      </p>
      {long ? (
        <button type="button" className="mt-1 text-xs font-semibold text-cardinal underline" onClick={() => setOpen((v) => !v)}>
          {open ? "Show less" : "Show all"}
        </button>
      ) : null}
    </div>
  );
}

export function CoachCaseView({ caseId }: { caseId: string }) {
  const [ov, setOv] = useState<Overview | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [qRaw, setQRaw] = useState("");
  const [shareMode, setShareMode] = useState<"file" | "link" | "paste">("link");
  const [shareTeams, setShareTeams] = useState<string[] | null>(null);
  const [share, setShare] = useState({ title: "", note: "", url: "", text: "" });
  const [shareFile, setShareFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/coach/case?caseId=${encodeURIComponent(caseId)}`).catch(() => null);
    const j = (await res?.json().catch(() => ({}))) as { overview?: Overview; questions?: Question[]; error?: string };
    if (!res?.ok || !j.overview) {
      setError(j?.error ?? "Could not load this case.");
      return;
    }
    setOv(j.overview);
    setQuestions(j.questions ?? []);
    setShareTeams((cur) => cur ?? j.overview!.teams.map((t) => t.teamId));
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>, label: string) {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch("/api/coach/case", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseId, ...body }),
      });
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
      if (!res.ok) {
        setError(j.error ?? "Could not save.");
        return null;
      }
      return j;
    } finally {
      setBusy(null);
    }
  }

  function startComment(teamIds: string[], sectionKey: string | null) {
    const sel = typeof window !== "undefined" ? window.getSelection()?.toString().replace(/\s+/g, " ").trim() ?? "" : "";
    setDraft({ teamIds, sectionKey, quote: sel.slice(0, 400), comment: "", suggested: "" });
  }

  async function sendComment() {
    if (!draft) return;
    const j = await post(
      {
        action: "comment",
        teamIds: draft.teamIds,
        sectionKey: draft.sectionKey,
        quote: draft.quote || null,
        comment: draft.comment,
        suggested: draft.suggested || null,
      },
      "Sending your comment...",
    );
    if (j) {
      setOv((j.overview as Overview) ?? ov);
      setDraft(null);
      setFlash(`Sent to ${draft.teamIds.length === 1 ? "the team" : `${draft.teamIds.length} teams`}. It shows in their suggestions, from you.`);
    }
  }

  async function addQuestions(raw: string) {
    const j = await post({ action: "questions", raw }, "Adding the questions...");
    if (j) {
      setQRaw("");
      setFlash(`${j.added as number} question${j.added === 1 ? "" : "s"} added for every team.`);
      await load();
    }
  }

  async function sendReading() {
    if (!ov) return;
    const fd = new FormData();
    fd.set("caseId", caseId);
    fd.set("teamIds", (shareTeams ?? []).join(","));
    if (share.title.trim()) fd.set("title", share.title.trim());
    if (share.note.trim()) fd.set("note", share.note.trim());
    if (shareMode === "file") {
      if (!shareFile) return setError("Choose a file first.");
      if (shareFile.size > 4.4 * 1024 * 1024) return setError("Files over 4 MB can't be uploaded. Use a link or paste.");
      fd.set("file", shareFile);
    } else if (shareMode === "link") {
      if (!/^https?:\/\//i.test(share.url.trim())) return setError("Paste a full link starting with http.");
      fd.set("url", share.url.trim());
    } else {
      if (share.text.trim().length < 80) return setError("Paste a bit more text.");
      fd.set("text", share.text);
    }
    setBusy("Cruxy is reading and digesting it for each team...");
    setError(null);
    try {
      const res = await fetch("/api/coach/case", { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as { shared?: number; error?: string };
      if (!res.ok) return setError(j.error ?? "Could not share that reading.");
      setShare({ title: "", note: "", url: "", text: "" });
      setShareFile(null);
      setFlash(`Shared with ${j.shared} team${j.shared === 1 ? "" : "s"}. It is in their Extra reading, digested, and Cruxy will use it in their suggestions.`);
    } finally {
      setBusy(null);
    }
  }

  if (error && !ov) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <p className="rounded-xl bg-white p-4 text-sm text-cardinal">{error}</p>
      </main>
    );
  }
  if (!ov) return <p className="px-4 py-8 text-sm text-muted">Loading the teams...</p>;

  const sectionKeys = ov.teams[0]?.sections.map((s) => ({ key: s.key, label: s.label })) ?? [];
  const cols = ov.teams.length;

  return (
    <main className="mx-auto max-w-[1400px] space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/coach/cases" className="text-sm font-semibold text-muted hover:text-ink">
            ← All cases
          </Link>
          <p className="m-0 mt-2 text-[12px] font-bold uppercase tracking-[0.12em] text-muted">Case {ov.caseNumber}, across teams</p>
          <h1 className="font-display m-0 text-3xl font-extrabold">{ov.caseTitle}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/case-brain/${caseId}?tab=reading`}
            className="inline-flex min-h-11 items-center rounded-xl border border-mist bg-white px-4 text-sm font-semibold"
          >
            Read the case
          </Link>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={async () => {
              const j = await post({ action: "compare" }, "Cruxy is reading all the documents...");
              if (j) setComparison(j.comparison as Comparison);
            }}
            className="inline-flex min-h-11 items-center rounded-xl bg-ink px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            Compare the teams with Cruxy
          </button>
        </div>
      </div>
      <p className="m-0 text-[13px] text-muted">
        Only you see this page. Teams never see each other&apos;s work; your comments reach only the team you send them to.
        Notes you leave on the case text from Read the case show for every team.
      </p>

      {busy ? <p className="m-0 text-sm text-muted" aria-live="polite">{busy}</p> : null}
      {error ? <p className="m-0 rounded-xl bg-cardinal/5 px-3 py-2 text-sm text-cardinal">{error}</p> : null}
      {flash ? (
        <p className="m-0 flex items-center justify-between rounded-xl bg-[#EAF6EF] px-3 py-2 text-sm">
          {flash}
          <button type="button" className="text-xs underline" onClick={() => setFlash(null)}>
            Close
          </button>
        </p>
      ) : null}

      {comparison ? (
        <section className="rounded-[20px] bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display m-0 text-xl font-extrabold">Where the teams stand</h2>
            <button type="button" className="text-xs underline" onClick={() => setComparison(null)}>
              Hide
            </button>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {comparison.teams.map((t) => (
              <div key={t.team} className="rounded-xl bg-[#F7F8FA] p-3 text-sm">
                <p className="m-0 font-semibold">{t.team}</p>
                <p className="m-0 mt-1">{t.stance}</p>
                <p className="m-0 mt-2 text-[#1F7A4D]">
                  <span className="font-semibold">Strongest: </span>
                  {t.strongest}
                </p>
                <p className="m-0 mt-1 text-cardinal">
                  <span className="font-semibold">Weakest: </span>
                  {t.weakest}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {comparison.differences.length ? (
              <div className="text-sm">
                <p className="m-0 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Where they differ</p>
                <ul className="m-0 mt-1 list-disc space-y-1 pl-5">
                  {comparison.differences.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {comparison.shared_gaps.length ? (
              <div className="text-sm">
                <p className="m-0 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">What no team handles</p>
                <ul className="m-0 mt-1 list-disc space-y-1 pl-5">
                  {comparison.shared_gaps.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          {comparison.questions.length ? (
            <div className="mt-3 text-sm">
              <p className="m-0 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Questions that would test every team</p>
              <ul className="m-0 mt-1 list-none space-y-1 p-0">
                {comparison.questions.map((q) => (
                  <li key={q} className="flex items-start justify-between gap-3 rounded-lg bg-[#F7F8FA] px-3 py-2">
                    <span>{q}</span>
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      className="shrink-0 text-xs font-semibold text-cardinal underline"
                      onClick={() => void addQuestions(q)}
                    >
                      Add for all teams
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="overflow-x-auto rounded-[20px] bg-white p-4">
        <div className="min-w-[860px]">
          <div className="grid gap-3" style={{ gridTemplateColumns: `160px repeat(${cols}, minmax(0, 1fr))` }}>
            <div />
            {ov.teams.map((t) => (
              <div key={t.teamId} className="rounded-xl bg-[#F7F8FA] px-3 py-2">
                <p className="m-0 font-display text-lg font-extrabold">{t.teamName}</p>
                <p className="m-0 text-[12px] text-muted">
                  {t.hasDocument
                    ? `${t.workingPath === "imported" ? "Their own document" : "Working document"}, ${t.openSuggestions} open suggestion${t.openSuggestions === 1 ? "" : "s"}`
                    : "No working document yet"}
                </p>
                <button
                  type="button"
                  className="mt-1 text-xs font-semibold text-cardinal underline"
                  onClick={() => startComment([t.teamId], null)}
                >
                  Comment to {t.teamName}
                </button>
              </div>
            ))}
            {sectionKeys.map((sk) => (
              <div key={sk.key} className="contents">
                <div className="pt-2">
                  <p className="m-0 text-sm font-semibold">{sk.label}</p>
                  <button
                    type="button"
                    className="mt-1 text-[12px] text-muted underline"
                    onClick={() => startComment(ov.teams.map((t) => t.teamId), sk.key)}
                  >
                    Comment to all teams
                  </button>
                </div>
                {ov.teams.map((t) => {
                  const body = t.sections.find((s) => s.key === sk.key)?.body ?? "";
                  const mine = t.coachComments.filter((c) => c.sectionKey === sk.key);
                  return (
                    <div key={t.teamId} className="rounded-xl border border-[#E3E5E9] p-3">
                      <Cell body={body} />
                      {mine.map((c) => (
                        <p key={c.id} className="m-0 mt-2 rounded-lg bg-[#FFF8DC] px-2 py-1.5 text-[13px]">
                          <span className="font-semibold">You: </span>
                          {c.text}
                          <span className="ml-1 text-[11px] text-muted">({STATUS[c.status] ?? c.status})</span>
                        </p>
                      ))}
                      <button
                        type="button"
                        className="mt-2 text-xs font-semibold text-cardinal underline"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => startComment([t.teamId], sk.key)}
                      >
                        Comment
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <p className="m-0 mt-2 text-[12px] text-muted">
          Tip: select words in a team&apos;s section, then press Comment to quote them.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[20px] bg-white p-5">
          <h2 className="font-display m-0 text-xl font-extrabold">Moderator questions</h2>
          <p className="m-0 mt-1 text-sm text-muted">
            Questions you add go live for every team right away: on the case page, in the question bank and in drills.
          </p>
          <textarea
            rows={4}
            value={qRaw}
            onChange={(e) => setQRaw(e.target.value)}
            placeholder="One question per line"
            className="mt-3 w-full rounded-xl border border-mist bg-[#F7F8FA] px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={Boolean(busy) || qRaw.trim().length < 8}
            onClick={() => void addQuestions(qRaw)}
            className="mt-2 min-h-11 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Add for all teams
          </button>
          {questions.length ? (
            <ul className="m-0 mt-4 list-none space-y-2 p-0">
              {questions.map((q) => (
                <li key={q.id} className="rounded-lg bg-[#F7F8FA] px-3 py-2 text-sm">
                  {q.text}
                  <span className="ml-1 text-[11px] text-muted">
                    {q.origin === "dr_b" ? "Yours" : q.origin_label ?? "Question bank"}
                    {q.status === "pending_confirm" ? ", waiting to confirm" : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="rounded-[20px] bg-white p-5">
          <h2 className="font-display m-0 text-xl font-extrabold">Send a reading</h2>
          <p className="m-0 mt-1 text-sm text-muted">
            One reading to the teams you pick. Cruxy digests it once; it lands in each team&apos;s Extra reading and
            their reading room, and feeds their suggestions.
          </p>
          <div className="mt-3 flex gap-1 rounded-xl bg-[#F1F2F4] p-1">
            {([
              ["link", "Web link"],
              ["file", "Upload a file"],
              ["paste", "Paste text"],
            ] as const).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setShareMode(m)}
                className={cn("flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold", shareMode === m ? "bg-white shadow-sm" : "text-muted")}
              >
                {label}
              </button>
            ))}
          </div>
          {shareMode === "link" ? (
            <input
              value={share.url}
              onChange={(e) => setShare({ ...share, url: e.target.value })}
              placeholder="https://..."
              className="mt-2 h-10 w-full rounded-xl border border-mist bg-[#F7F8FA] px-3 text-sm"
            />
          ) : shareMode === "file" ? (
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md,.html,.htm"
              onChange={(e) => setShareFile(e.target.files?.[0] ?? null)}
              className="mt-2 block w-full text-sm"
            />
          ) : (
            <textarea
              rows={5}
              value={share.text}
              onChange={(e) => setShare({ ...share, text: e.target.value })}
              placeholder="Paste the text"
              className="mt-2 w-full rounded-xl border border-mist bg-[#F7F8FA] px-3 py-2 text-sm"
            />
          )}
          <input
            value={share.title}
            onChange={(e) => setShare({ ...share, title: e.target.value })}
            placeholder="Title (optional)"
            className="mt-2 h-10 w-full rounded-xl border border-mist bg-[#F7F8FA] px-3 text-sm"
          />
          <textarea
            rows={2}
            value={share.note}
            onChange={(e) => setShare({ ...share, note: e.target.value })}
            placeholder="A note to the teams (optional): why it matters, what to look for"
            className="mt-2 w-full rounded-xl border border-mist bg-[#F7F8FA] px-3 py-2 text-sm"
          />
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            {ov.teams.map((t) => (
              <label key={t.teamId} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={(shareTeams ?? []).includes(t.teamId)}
                  onChange={(e) =>
                    setShareTeams((cur) =>
                      e.target.checked ? [...(cur ?? []), t.teamId] : (cur ?? []).filter((x) => x !== t.teamId),
                    )
                  }
                />
                {t.teamName}
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={Boolean(busy) || !(shareTeams ?? []).length}
            onClick={() => void sendReading()}
            className="mt-3 min-h-11 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Send to {(shareTeams ?? []).length === ov.teams.length ? "all teams" : `${(shareTeams ?? []).length} team${(shareTeams ?? []).length === 1 ? "" : "s"}`}
          </button>
        </section>
      </div>

      {draft ? (
        <div role="dialog" aria-label="Comment" className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/30 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-[20px] bg-white p-5 shadow-xl">
            <h3 className="font-display m-0 text-lg font-extrabold">
              Comment to{" "}
              {draft.teamIds.length === ov.teams.length
                ? "all teams"
                : ov.teams.filter((t) => draft.teamIds.includes(t.teamId)).map((t) => t.teamName).join(", ")}
              {draft.sectionKey ? `, on ${sectionKeys.find((s) => s.key === draft.sectionKey)?.label ?? "a section"}` : ""}
            </h3>
            {draft.quote ? (
              <p className="m-0 mt-2 rounded-lg bg-[#F7F8FA] px-3 py-2 text-[13px] text-muted">
                On &ldquo;{draft.quote}&rdquo;{" "}
                <button type="button" className="underline" onClick={() => setDraft({ ...draft, quote: "" })}>
                  Remove
                </button>
              </p>
            ) : null}
            <textarea
              autoFocus
              rows={4}
              value={draft.comment}
              onChange={(e) => setDraft({ ...draft, comment: e.target.value })}
              placeholder="Your comment, idea or question for the team"
              className="mt-3 w-full rounded-xl border border-mist bg-[#F7F8FA] px-3 py-2 text-sm"
            />
            <textarea
              rows={3}
              value={draft.suggested}
              onChange={(e) => setDraft({ ...draft, suggested: e.target.value })}
              placeholder="Suggested wording (optional). The team can Take it straight into their document."
              className="mt-2 w-full rounded-xl border border-mist bg-[#F7F8FA] px-3 py-2 text-sm"
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={Boolean(busy) || !draft.comment.trim()}
                onClick={() => void sendComment()}
                className="min-h-11 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Send
              </button>
              <button type="button" onClick={() => setDraft(null)} className="min-h-11 rounded-xl border border-mist px-4 text-sm font-semibold">
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
