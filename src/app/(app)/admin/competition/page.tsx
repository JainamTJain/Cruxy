"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type Comp = { id: string; name: string; date: string };
type CaseRow = { id: string; number: number; title: string; active: boolean };
type Team = { id: string; name: string };
type Log = {
  id: string;
  opponent: string;
  case_number: number | null;
  moderator_question: string | null;
  score_us: number | null;
  score_them: number | null;
  result: string | null;
  created_at: string;
};

function TeamResultsForm({
  teams,
  onDone,
}: {
  teams: Team[];
  onDone: (msg: string) => void;
}) {
  const [teamId, setTeamId] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!teamId && teams[0]) setTeamId(teams[0].id);
  }, [teams, teamId]);

  async function save() {
    setBusy(true);
    const res = await fetch("/api/season/results", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        team_id: teamId,
        derive_from_logs: true,
        advanced,
        advancement_note: note || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      onDone("Could not save team result.");
      return;
    }
    onDone(
      advanced
        ? "Team result saved. Nationals prep checklist is ready."
        : "Team result saved from logged rounds.",
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border border-ink/10 bg-white/60 p-4">
      <h2 className="font-display text-lg font-semibold">Team results</h2>
      <p className="m-0 text-sm text-muted">
        How each USC team did at the regional. Counts come from logged rounds.
        Only Dr. B or Jainam enter this.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Team
          <select
            className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2"
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
        <label className="flex items-end gap-2 text-sm">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={advanced}
            onChange={(e) => setAdvanced(e.target.checked)}
          />
          Advanced (e.g. to Nationals)
        </label>
        <label className="text-sm sm:col-span-2">
          Advancement note
          <input
            className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="to Nationals"
          />
        </label>
      </div>
      <Button type="button" disabled={busy || !teamId} onClick={() => void save()}>
        Save team result from logs
      </Button>
      <Link href="/season" className="ml-3 text-sm underline">
        Open after-regional hub
      </Link>
    </section>
  );
}

export default function CompetitionLogPage() {
  const [competitions, setCompetitions] = useState<Comp[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    competition_id: "",
    team_id: "",
    case_id: "",
    opponent: "",
    moderator_question: "",
    judges_questions: "",
    judge_comments: "",
    score_us: "",
    score_them: "",
    result: "pending",
  });

  async function load() {
    const res = await fetch("/api/admin/competition-log");
    if (!res.ok) {
      setError("Admin view required.");
      return;
    }
    const data = (await res.json()) as {
      logs: Log[];
      competitions: Comp[];
      cases: CaseRow[];
      teams: Team[];
    };
    setLogs(data.logs);
    setCompetitions(data.competitions);
    setCases(data.cases.filter((c) => c.active));
    setTeams(data.teams);
    setForm((f) => ({
      ...f,
      competition_id: f.competition_id || data.competitions[0]?.id || "",
      team_id: f.team_id || data.teams[0]?.id || "",
    }));
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const cas = cases.find((c) => c.id === form.case_id);
    const res = await fetch("/api/admin/competition-log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        competition_id: form.competition_id,
        team_id: form.team_id || null,
        case_id: form.case_id || null,
        case_number: cas?.number ?? null,
        opponent: form.opponent,
        moderator_question: form.moderator_question || null,
        judges_questions: form.judges_questions || null,
        judge_comments: form.judge_comments || null,
        score_us: form.score_us ? Number(form.score_us) : null,
        score_them: form.score_them ? Number(form.score_them) : null,
        result: form.result,
      }),
    });
    if (!res.ok) {
      setMsg("Could not save.");
      return;
    }
    setMsg("Logged. Questions tagged “Asked at UCSB” for the bank.");
    setForm((f) => ({
      ...f,
      opponent: "",
      moderator_question: "",
      judges_questions: "",
      judge_comments: "",
      score_us: "",
      score_them: "",
    }));
    await load();
  }

  async function rollover() {
    const res = await fetch("/api/admin/season", { method: "POST" });
    const j = (await res.json()) as {
      message?: string;
      error?: string;
      downloadPath?: string | null;
      filename?: string;
    };
    if (j.downloadPath) {
      setMsg(
        `${j.message ?? "Archive ready."} Download: ${j.downloadPath}`,
      );
      return;
    }
    setMsg(
      j.message ??
        j.error ??
        (j.filename ? `Archive built: ${j.filename}` : "Done"),
    );
  }

  if (error) {
    return <p className="text-sm text-cardinal">{error}</p>;
  }

  return (
    <main className="animate-fade-up space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">Competition log</h1>
        <p className="mt-1 text-sm text-muted">
          Per round during and after competition. Real questions enter the bank
          tagged “Asked at UCSB”.
        </p>
      </div>

      <form onSubmit={(e) => void submit(e)} className="space-y-3 rounded-2xl border border-ink/10 bg-white/60 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Competition
            <select
              className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2"
              value={form.competition_id}
              onChange={(e) => setForm({ ...form, competition_id: e.target.value })}
            >
              {competitions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.date})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Team
            <select
              className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2"
              value={form.team_id}
              onChange={(e) => setForm({ ...form, team_id: e.target.value })}
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Case
            <select
              className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2"
              value={form.case_id}
              onChange={(e) => setForm({ ...form, case_id: e.target.value })}
            >
              <option value="">Select</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.number}. {c.title}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Opponent
            <input
              required
              className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2"
              value={form.opponent}
              onChange={(e) => setForm({ ...form, opponent: e.target.value })}
            />
          </label>
        </div>
        <label className="block text-sm">
          Moderator question
          <textarea
            className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2"
            rows={2}
            value={form.moderator_question}
            onChange={(e) =>
              setForm({ ...form, moderator_question: e.target.value })
            }
          />
        </label>
        <label className="block text-sm">
          Judges&apos; questions
          <textarea
            className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2"
            rows={2}
            value={form.judges_questions}
            onChange={(e) =>
              setForm({ ...form, judges_questions: e.target.value })
            }
          />
        </label>
        <label className="block text-sm">
          Judge comments
          <textarea
            className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2"
            rows={2}
            value={form.judge_comments}
            onChange={(e) => setForm({ ...form, judge_comments: e.target.value })}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            Our score
            <input
              className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2"
              value={form.score_us}
              onChange={(e) => setForm({ ...form, score_us: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Their score
            <input
              className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2"
              value={form.score_them}
              onChange={(e) => setForm({ ...form, score_them: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Result
            <select
              className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2"
              value={form.result}
              onChange={(e) => setForm({ ...form, result: e.target.value })}
            >
              <option value="pending">pending</option>
              <option value="win">win</option>
              <option value="loss">loss</option>
              <option value="tie">tie</option>
            </select>
          </label>
        </div>
        <Button type="submit">Save round</Button>
      </form>

      <section>
        <h2 className="font-display text-xl font-semibold">Logged rounds</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {logs.length === 0 ? (
            <li className="text-muted">None yet.</li>
          ) : (
            logs.map((l) => (
              <li
                key={l.id}
                className="rounded-xl border border-ink/5 bg-white/50 px-3 py-2"
              >
                vs {l.opponent}
                {l.case_number != null ? `, Case ${l.case_number}` : ""},{" "}
                {l.result}
                {l.score_us != null
                  ? `, ${l.score_us}–${l.score_them ?? "?"}`
                  : ""}
              </li>
            ))
          )}
        </ul>
      </section>

      <TeamResultsForm teams={teams} onDone={setMsg} />

      <section className="rounded-2xl border border-ink/10 bg-white/60 p-4">
        <h2 className="font-display text-lg font-semibold">Season rollover</h2>
        <p className="mt-1 text-sm text-muted">
          Build a downloadable archive (Drive service account is read only),
          then import the next case set and reset roles and roadmaps. Keeps the
          Things bank, example library, and glossary. Tech admin only.
        </p>
        <Button className="mt-3" variant="outline" onClick={() => void rollover()}>
          Queue season rollover
        </Button>
      </section>

      {msg ? <p className="text-sm text-muted">{msg}</p> : null}
      <Link href="/admin" className="text-sm underline">
        Back to admin
      </Link>
    </main>
  );
}
