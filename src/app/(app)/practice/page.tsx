"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
  { id: "full_round", label: "Full round", blurb: "Presentation → commentary → Q&A" },
  { id: "moderator_drill", label: "Moderator drill", blurb: "Bank questions out loud" },
  { id: "commentary_drill", label: "Commentary drill", blurb: "Cruxy presents; you comment" },
  { id: "judges_qa_drill", label: "Judges' Q&A", blurb: "Rapid follow-ups from Cruxy" },
  { id: "solo_speech", label: "Solo speech", blurb: "One part, scored" },
  { id: "free_record", label: "Free record", blurb: "Discussion → Truth Source ideas" },
  { id: "conferral_drill", label: "Conferral", blurb: "60s confer, then answer" },
  { id: "thesis_30", label: "Thesis in 30s", blurb: "One sentence under the clock" },
  { id: "qa_routing", label: "Q&A routing", blurb: "Right person takes the question" },
];

export default function PracticePage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [mode, setMode] = useState<PracticeMode>("solo_speech");
  const [caseId, setCaseId] = useState<string>("");
  const [code, setCode] = useState("");
  const [joinMsg, setJoinMsg] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(false);
  const [inviteTeamId, setInviteTeamId] = useState("");

  async function refresh() {
    const res = await fetch("/api/practice/sessions");
    const data = await res.json();
    setSessions(data.sessions ?? []);
    setCases((data.cases ?? []).filter((c: CaseRow) => c.active));
    setTeams(data.teams ?? []);
    if (!caseId && data.cases?.[0]) setCaseId(data.cases.find((c: CaseRow) => c.active)?.id ?? "");
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
        window.location.href = `/practice/sessions/${data.session.id}?screen=${data.screen ?? "observer"}`;
      } else {
        setJoinMsg(data.error ?? "Could not join from link");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startPractice() {
    const drillRoutes: Partial<Record<PracticeMode, string>> = {
      moderator_drill: "/practice/drills/moderator",
      commentary_drill: "/practice/drills/commentary",
      judges_qa_drill: "/practice/drills/judges-qa",
      free_record: "/practice/drills/free-record",
      conferral_drill: "/practice/drills/conferral",
      qa_routing: "/practice/drills/qa-routing",
      thesis_30: "/practice/drills/thesis",
    };
    const drillHref = drillRoutes[mode];
    if (drillHref) {
      window.location.href = caseId
        ? `${drillHref}?caseId=${encodeURIComponent(caseId)}`
        : drillHref;
      return;
    }

    setBusy(true);
    setCreatedCode(null);
    const caseRow = cases.find((c) => c.id === caseId);
    const myTeam = teams[0]?.id ?? null;
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
    if (data.session?.code) setCreatedCode(data.session.code);
    if (data.session?.id) {
      await refresh();
      window.location.href = `/practice/sessions/${data.session.id}`;
    }
  }

  async function join() {
    setJoinMsg(null);
    const res = await fetch("/api/practice/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) {
      setJoinMsg(data.error ?? "Join failed");
      return;
    }
    window.location.href = `/practice/sessions/${data.session.id}?screen=${data.screen}`;
  }

  return (
    <main className="animate-fade-up space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">Practice</h1>
        <p className="mt-1 text-sm text-muted">
          Start alone or with a team. No admin needed. Admins also set up group days.
        </p>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-ink/10 bg-white/70 p-4">
          <h2 className="font-display text-xl font-semibold">Start a practice</h2>
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
              {busy ? "Starting…" : "Start"}
            </Button>
            {createdCode ? (
              <div className="space-y-1 text-sm">
                <p className="font-mono">Join code: {createdCode}</p>
                <p className="break-all text-muted">
                  Online link:{" "}
                  {typeof window !== "undefined"
                    ? `${window.location.origin}/practice?code=${createdCode}`
                    : `/practice?code=${createdCode}`}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-ink/10 bg-white/70 p-4">
          <h2 className="font-display text-xl font-semibold">Join with a code or link</h2>
          <p className="mt-1 text-sm text-muted">
            Members tap Join from home; online friends open the shared link. Judges use the{" "}
            <Link href="/judging" className="underline">
              Judging portal
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
              Join
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
                    {s.rounds[0]?.mode ?? s.mode ?? "Not set"}
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
