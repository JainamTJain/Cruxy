"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageIntro } from "@/components/page-intro";
import { Button } from "@/components/ui/button";

type CaseRow = { id: string; number: number; title: string; active: boolean };
type SoloItem = {
  questionId: string | null;
  prompt: string;
  answer: string | null;
  feedback: string | null;
  appeNotes: string | null;
  answeredAt: string | null;
};
type SoloSession = {
  id: string;
  case_id: string;
  kind: "moderator" | "judges";
  status: "active" | "done";
  current_index: number;
  items: SoloItem[];
};

function SoloQaInner() {
  const search = useSearchParams();
  const caseFromUrl = search.get("caseId");
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [active, setActive] = useState<SoloSession[]>([]);
  const [caseId, setCaseId] = useState(caseFromUrl ?? "");
  const [kind, setKind] = useState<"moderator" | "judges">("moderator");
  const [session, setSession] = useState<SoloSession | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leadFirst, setLeadFirst] = useState<string[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/practice/solo-qa");
    if (!res.ok) {
      setError("Could not load solo practice.");
      return;
    }
    const data = (await res.json()) as {
      active: SoloSession[];
      teamId: string | null;
      cases: CaseRow[];
      leadCaseIds?: string[];
    };
    setActive(data.active);
    setTeamId(data.teamId);
    setCases(data.cases.filter((c) => c.active));
    setLeadFirst(data.leadCaseIds ?? []);
    if (!caseId && data.cases[0]) {
      const preferred =
        data.leadCaseIds?.find((id) =>
          data.cases.some((c) => c.id === id && c.active),
        ) ?? data.cases.find((c) => c.active)?.id;
      if (preferred) setCaseId(preferred);
    }
    setError(null);
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (caseFromUrl) setCaseId(caseFromUrl);
  }, [caseFromUrl]);

  const orderedCases = useMemo(() => {
    const lead = new Set(leadFirst);
    return [...cases].sort((a, b) => {
      const al = lead.has(a.id) ? 0 : 1;
      const bl = lead.has(b.id) ? 0 : 1;
      if (al !== bl) return al - bl;
      return a.number - b.number;
    });
  }, [cases, leadFirst]);

  const current = session?.items[session.current_index] ?? null;
  const lastAnswered =
    session && session.current_index > 0
      ? session.items[session.current_index - 1]
      : null;

  async function start() {
    if (!teamId || !caseId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/practice/solo-qa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "start",
          caseId,
          teamId,
          kind,
        }),
      });
      const data = (await res.json()) as { session?: SoloSession; error?: string };
      if (!res.ok || !data.session) {
        setError(data.error ?? "Could not start.");
        return;
      }
      setSession(data.session);
      setAnswer("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function resume(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/practice/solo-qa?id=${encodeURIComponent(id)}`);
      const data = (await res.json()) as { session?: SoloSession; error?: string };
      if (!res.ok || !data.session) {
        setError(data.error ?? "Could not resume.");
        return;
      }
      setSession(data.session);
      setAnswer("");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!session || !answer.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/practice/solo-qa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "answer",
          sessionId: session.id,
          answer: answer.trim(),
        }),
      });
      const data = (await res.json()) as { session?: SoloSession; error?: string };
      if (!res.ok || !data.session) {
        setError(data.error ?? "Could not save answer.");
        return;
      }
      setSession(data.session);
      setAnswer("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 animate-fade-up pb-10">
      <PageIntro title="Solo questions">
        Moderator and judge questions for cases you lead first. Answer aloud or
        typed. Cruxy gives APPE-card feedback. Sessions save so you can resume.
      </PageIntro>

      {error ? <p className="text-sm text-cardinal">{error}</p> : null}

      {!session ? (
        <>
          {active.length > 0 ? (
            <section className="rounded-[20px] bg-white p-5">
              <h2 className="font-display m-0 text-lg font-extrabold">
                Resume
              </h2>
              <ul className="mt-3 m-0 list-none space-y-2 p-0">
                {active.map((s) => {
                  const c = cases.find((x) => x.id === s.case_id);
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 rounded-xl border border-ink/10 px-4 py-3 text-left text-sm hover:bg-[#F7F8FA]"
                        onClick={() => void resume(s.id)}
                      >
                        <span>
                          {c
                            ? `Case ${String(c.number).padStart(2, "0")}`
                            : "Case"}
                          , {s.kind === "judges" ? "Judges" : "Moderator"}
                        </span>
                        <span className="text-xs text-muted">
                          {s.current_index}/{s.items.length}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section className="rounded-[20px] bg-white p-5 space-y-3">
            <h2 className="font-display m-0 text-lg font-extrabold">
              Start new
            </h2>
            <label className="block text-sm">
              Case
              <select
                className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2"
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
              >
                {orderedCases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {String(c.number).padStart(2, "0")}. {c.title}
                    {leadFirst.includes(c.id) ? " (you lead)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Kind
              <select
                className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2"
                value={kind}
                onChange={(e) =>
                  setKind(e.target.value as "moderator" | "judges")
                }
              >
                <option value="moderator">Moderator questions</option>
                <option value="judges">Judge questions</option>
              </select>
            </label>
            <Button type="button" disabled={busy || !caseId} onClick={() => void start()}>
              {busy ? "Starting…" : "Start"}
            </Button>
          </section>
        </>
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
            <span>
              {session.kind === "judges" ? "Judges" : "Moderator"}, question{" "}
              {Math.min(session.current_index + 1, session.items.length)} of{" "}
              {session.items.length}
            </span>
            <button
              type="button"
              className="underline"
              onClick={() => setSession(null)}
            >
              Leave (saved)
            </button>
          </div>

          {session.status === "done" ? (
            <div className="rounded-[20px] bg-white p-5">
              <p className="m-0 text-sm font-semibold">Session done.</p>
              <p className="mt-2 text-sm text-muted">
                Review the last feedback below, or start another case.
              </p>
              <Button
                type="button"
                className="mt-3"
                onClick={() => setSession(null)}
              >
                Back
              </Button>
            </div>
          ) : current ? (
            <div className="rounded-[20px] bg-white p-5 space-y-3">
              <p className="m-0 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                Question
              </p>
              <p className="m-0 text-[17px] font-semibold leading-snug">
                {current.prompt}
              </p>
              <label className="block text-sm">
                Your answer (typed or after speaking aloud)
                <textarea
                  className="mt-1 min-h-[120px] w-full rounded-xl border border-ink/15 bg-white px-3 py-2"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Type what you said, or draft here."
                />
              </label>
              <Button
                type="button"
                disabled={busy || !answer.trim()}
                onClick={() => void submit()}
              >
                {busy ? "Cruxy is reading…" : "Get feedback"}
              </Button>
            </div>
          ) : null}

          {lastAnswered?.feedback ? (
            <div className="rounded-[20px] border border-ink/10 bg-[#F7F8FA] p-5">
              <p className="m-0 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                Cruxy feedback
              </p>
              <p className="mt-2 text-sm leading-snug">{lastAnswered.feedback}</p>
              {lastAnswered.appeNotes ? (
                <p className="mt-2 text-xs text-muted">
                  APPE: {lastAnswered.appeNotes}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      )}

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/practice/study" className="underline text-muted">
          Flashcard decks
        </Link>
        <Link href="/practice" className="underline text-muted">
          All practice
        </Link>
      </div>
    </main>
  );
}

export default function SoloQaPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <SoloQaInner />
    </Suspense>
  );
}
