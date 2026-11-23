"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageIntro } from "@/components/page-intro";
import { Button } from "@/components/ui/button";
import {
  OneTapJudgeDrill,
  PreRoundCalmCta,
  PreRoundWarmupCta,
} from "@/components/product";
import { DRILL_ROUTES, hrefForPracticeScreen } from "@/lib/practice/join-routing";
import type { PracticeMode } from "@/lib/practice/types";

type CaseRow = { id: string; number: number; title: string; active: boolean };
type Team = { id: string; name: string; colour: string };
type SessionRow = {
  id: string;
  title: string;
  kind: string;
  date: string;
  status: string;
  mode: string | null;
  rounds: { id: string; mode: string; case_number: number | null }[];
};

const MODES: { id: PracticeMode; label: string; blurb: string }[] = [
  {
    id: "full_round",
    label: "Full round",
    blurb: "Presentation, commentary, then judges' questions",
  },
  {
    id: "moderator_drill",
    label: "Moderator drill",
    blurb: "Answer bank questions out loud",
  },
  {
    id: "commentary_drill",
    label: "Commentary drill",
    blurb: "Cruxy presents; you give commentary",
  },
  {
    id: "judges_qa_drill",
    label: "Judges' Q&A",
    blurb: "Quick follow-ups from Cruxy as a judge",
  },
  {
    id: "solo_speech",
    label: "Solo speech",
    blurb: "One speaking part, then a judge card",
  },
  {
    id: "free_record",
    label: "Free record",
    blurb: "Talk freely; pull ideas into the Evidence Library",
  },
  {
    id: "conferral_drill",
    label: "Conferral",
    blurb: "Sixty seconds to confer, then answer",
  },
  {
    id: "thesis_30",
    label: "Thesis in 30s",
    blurb: "One clear sentence under the clock",
  },
  {
    id: "qa_routing",
    label: "Q&A routing",
    blurb: "Send each question to the right speaker",
  },
];

export default function PracticePage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [mode, setMode] = useState<PracticeMode>("solo_speech");
  const [caseId, setCaseId] = useState<string>("");
  const [code, setCode] = useState("");
  const [joinMsg, setJoinMsg] = useState<string | null>(null);
  const [createdJoinPath, setCreatedJoinPath] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const [inviteTeamId, setInviteTeamId] = useState("");

  async function refresh() {
    try {
      const res = await fetch("/api/practice/sessions");
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error ?? "Could not load practice. Refresh the page.");
        return;
      }
      setLoadError(null);
      setSessions(data.sessions ?? []);
      setCases((data.cases ?? []).filter((c: CaseRow) => c.active));
      setTeams(data.teams ?? []);
      if (!caseId && data.cases?.[0]) setCaseId(data.cases.find((c: CaseRow) => c.active)?.id ?? "");
    } catch {
      setLoadError("Network problem loading practice. Check your connection and refresh.");
    }
  }

  useEffect(() => {
    void (async () => {
      await refresh();
      if (typeof window === "undefined") return;
      const q = new URLSearchParams(window.location.search);
      const fromLink = q.get("code");
      if (!fromLink) return;
      const upper = fromLink.toUpperCase();
      setCode(upper);
      // F-190: open the link → join and land on the session (own-device record).
      const res = await fetch("/api/practice/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: upper }),
      });
      const data = await res.json();
      if (res.ok && data.session?.id) {
        window.location.href =
          data.href ??
          hrefForPracticeScreen(data.screen, {
            sessionId: data.session.id,
            roundId: data.roundId ?? data.rounds?.[0]?.id ?? null,
          });
      } else {
        setJoinMsg(
          [data.error, data.whatToDo].filter(Boolean).join(" ") ||
            "Could not join from that link. Check the code and try again.",
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startPractice() {
    const drillHref = DRILL_ROUTES[mode];
    if (drillHref) {
      window.location.href = caseId
        ? `${drillHref}?caseId=${encodeURIComponent(caseId)}`
        : drillHref;
      return;
    }

    if (busy) return;
    setBusy(true);
    setCreatedJoinPath(null);
    setStartError(null);
    const caseRow = cases.find((c) => c.id === caseId);
    const myTeam = teams[0]?.id ?? null;
    try {
      const res = await fetch("/api/practice/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "member_practice",
          title: `${MODES.find((m) => m.id === mode)?.label ?? "Practice"}`,
          mode,
          online,
          inviteTeamIds: inviteTeamId ? [inviteTeamId] : [],
          rounds: [
            {
              caseId: caseId || null,
              caseNumber: caseRow?.number ?? null,
              teamIds: myTeam ? [myTeam] : [],
              sides: { presenting: myTeam, commenting: null },
              moderator: "cruxy",
              judges: { humans: [], cruxy: true },
              mode,
            },
          ],
        }),
      });
      const data = await res.json();
      setBusy(false);
      if (!res.ok) {
        setStartError(data.error ?? "Could not start practice. Try again.");
        return;
      }
      if (data.session?.joinPath) setCreatedJoinPath(data.session.joinPath);
      if (data.session?.id) {
        await refresh();
        window.location.href = `/practice/sessions/${data.session.id}`;
      }
    } catch {
      setBusy(false);
      setStartError("Network problem. Check your connection and try again.");
    }
  }

  async function join() {
    setJoinMsg(null);
    try {
      const res = await fetch("/api/practice/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setJoinMsg(
          [data.error, data.whatToDo].filter(Boolean).join(" ") ||
            "Could not join. Check the code with the person who started practice.",
        );
        return;
      }
      window.location.href =
        data.href ??
        hrefForPracticeScreen(data.screen, {
          sessionId: data.session.id,
          roundId: data.roundId ?? data.rounds?.[0]?.id ?? null,
        });
    } catch {
      setJoinMsg("Network problem joining. Check your connection and try again.");
    }
  }

  return (
    <main className="animate-fade-up space-y-8">
      <PageIntro title="Practice">
        Study flashcards by your role, answer solo questions, or run a drill or
        full round with your team.
      </PageIntro>

      {loadError ? (
        <p className="rounded-xl border border-cardinal/30 bg-white px-4 py-3 text-sm text-cardinal" role="alert">
          {loadError}
        </p>
      ) : null}

      <section className="rounded-[20px] border border-ink/10 bg-white p-5">
        <h2 className="font-display m-0 text-xl font-extrabold">Study</h2>
        <p className="mt-1 text-sm text-muted">
          Flashcards from one pagers, ordered by role. Solo moderator and judge
          questions with Cruxy feedback. This is the place to study.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/practice/study"
            className="inline-flex h-11 items-center rounded-xl bg-cardinal px-4 text-sm font-semibold text-white"
          >
            Open decks
          </Link>
          <Link
            href={
              caseId
                ? `/practice/solo-qa?caseId=${encodeURIComponent(caseId)}`
                : "/practice/solo-qa"
            }
            className="inline-flex h-11 items-center rounded-xl border border-ink/15 px-4 text-sm font-semibold"
          >
            Solo questions
          </Link>
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-[20px] bg-white p-4 sm:flex-row sm:items-center">
        <p className="mr-auto text-sm text-muted">
          Most useful before a round
        </p>
        <PreRoundCalmCta caseId={caseId || null} compact />
        <PreRoundWarmupCta caseId={caseId || null} compact />
        <OneTapJudgeDrill caseId={caseId || null} compact />
        <Link
          href={caseId ? `/prepare/mock?caseId=${caseId}` : "/prepare/mock"}
          className="inline-flex min-h-11 items-center rounded-xl border border-ink/15 px-3 text-sm font-semibold"
        >
          Solo mock
        </Link>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-ink/10 bg-white/70 p-4">
          <h2 className="font-display text-xl font-semibold">Start practice</h2>
          <p className="mt-1 text-sm text-muted">
            Choose how you want to practise, then press Start.
          </p>
          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              Mode
              <select
                className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2"
                value={mode}
                onChange={(e) => setMode(e.target.value as PracticeMode)}
              >
                {MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}: {m.blurb}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Case
              <select
                className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2"
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
              >
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {String(c.number).padStart(2, "0")}. {c.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={online}
                onChange={(e) => setOnline(e.target.checked)}
              />
              Online (each person records on their own phone)
            </label>
            <label className="block text-sm">
              Invite another team
              <select
                className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2"
                value={inviteTeamId}
                onChange={(e) => setInviteTeamId(e.target.value)}
              >
                <option value="">None</option>
                {teams.slice(1).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="button" disabled={busy} onClick={() => void startPractice()}>
              {busy ? "Starting…" : "Start practice"}
            </Button>
            {startError ? (
              <p className="text-sm text-cardinal" role="alert">
                {startError}
              </p>
            ) : null}
            {createdJoinPath ? (
              <div className="space-y-1 text-sm">
                <p>
                  Session codes are for admins. Invite your team from the
                  session page, or share this link:
                </p>
                <p className="break-all text-muted">
                  {typeof window !== "undefined"
                    ? `${window.location.origin}${createdJoinPath}`
                    : createdJoinPath}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-ink/10 bg-white/70 p-4">
          <h2 className="font-display text-xl font-semibold">Join with a code</h2>
          <p className="mt-1 text-sm text-muted">
            Enter the code someone read aloud, or open their shared link. Judges
            score on the{" "}
            <Link href="/judging" className="underline">
              judging portal
            </Link>
            .
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <input
              className="rounded-xl border border-ink/15 bg-white px-3 py-2 font-mono uppercase tracking-widest"
              placeholder="CODE"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={8}
            />
            <Button type="button" variant="secondary" onClick={() => void join()}>
              Join practice
            </Button>
          </div>
          {joinMsg ? <p className="mt-2 text-sm text-cardinal">{joinMsg}</p> : null}
        </div>
      </section>

      <section className="rounded-2xl border border-ink/10 bg-white/60 p-4">
        <h2 className="font-display text-lg font-semibold">Your prediction trend</h2>
        <p className="mt-1 text-sm text-muted">
          After rounds are judged, see how close your guesses were. Compared
          only with your own past.
        </p>
        <Link
          href="/practice/calibration"
          className="mt-3 inline-block text-sm text-cardinal underline"
        >
          Open your score predictions
        </Link>
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold">Your sessions</h2>
        <ul className="mt-3 space-y-2">
          {sessions.length === 0 ? (
            <li className="text-sm text-muted">No sessions yet.</li>
          ) : (
            sessions.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/practice/sessions/${s.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 bg-white/60 px-4 py-3 hover:bg-white"
                >
                  <span>
                    <span className="font-medium">{s.title}</span>
                    <span className="ml-2 text-xs text-muted">
                      {s.kind}, {s.date}, {s.status}
                    </span>
                  </span>
                  <span className="font-mono text-xs text-muted">
                    {s.rounds[0]?.mode ?? s.mode ?? "Practice"}
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-2xl border border-ink/10 bg-white/60 p-4">
        <h2 className="font-display text-lg font-semibold">APPE scoring sheet</h2>
        <p className="mt-1 text-sm text-muted">
          Items, bands and Guide to Scoring built from the Drive Training Documents sheet.
        </p>
        <Link
          href="/practice/scoring-sheet"
          className="mt-3 inline-block text-sm text-cardinal underline"
        >
          Open scoring sheet
        </Link>
      </section>

      <section className="rounded-2xl border border-ink/10 bg-white/60 p-4">
        <h2 className="font-display text-lg font-semibold">Admin setup</h2>
        <p className="mt-1 text-sm text-muted">
          Jainam or Dr. B: switch to admin view, then create a group session with rounds,
          timings, moderator and judges. The session code stays admin-only.
        </p>
        <Link href="/practice/admin" className="mt-3 inline-block text-sm text-cardinal underline">
          Open admin session builder
        </Link>
      </section>
    </main>
  );
}
