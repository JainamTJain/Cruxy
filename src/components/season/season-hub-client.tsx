"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Team = { id: string; name: string };
type Result = {
  team_id: string;
  rounds_played: number;
  wins: number;
  losses: number;
  ties: number;
  advanced: boolean;
  advancement_note: string | null;
  notes: string | null;
};
type Retro = {
  what_worked: string;
  what_to_change: string;
  cases_that_landed: string;
  arguments_that_landed: string;
  status: string;
};
type Theme = {
  id: string;
  theme: string;
  summary: string;
  citation_quotes: Array<{
    quote: string;
    opponent: string;
    case_number: number | null;
  }>;
};
type ChecklistItem = {
  id: string;
  label: string;
  detail: string;
  done: boolean;
};
type Handoff = {
  body: string;
  who_did_what: Array<{
    person_id: string | null;
    person_name: string;
    role: string;
    cases: string;
    notes: string;
  }>;
};
type Log = {
  id: string;
  opponent: string;
  case_number: number | null;
  score_us: number | null;
  score_them: number | null;
  result: string | null;
  judge_comments: string | null;
};

type Hub = {
  season: {
    id: string;
    label: string;
    status: string;
    archived_at: string | null;
  };
  teams: Team[];
  results: Result[];
  myResult: Result | null;
  retro: Retro | null;
  themes: Theme[];
  checklist: ChecklistItem[];
  handoff: Handoff | null;
  teamLogs: Log[];
  archived: boolean;
  viewer: {
    personId: string;
    teamId: string | null;
    role: string;
    name: string;
    adminView: boolean;
  };
};

type Tab = "results" | "retro" | "nationals" | "archive" | "handoff";

export function SeasonHubClient() {
  const [hub, setHub] = useState<Hub | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("results");
  const [msg, setMsg] = useState<string | null>(null);
  const [retro, setRetro] = useState<Retro>({
    what_worked: "",
    what_to_change: "",
    cases_that_landed: "",
    arguments_that_landed: "",
    status: "draft",
  });
  const [handoffBody, setHandoffBody] = useState("");
  const [who, setWho] = useState<Handoff["who_did_what"]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/season");
    if (!res.ok) {
      setError("Could not load the season hub. Sign in and try again.");
      return;
    }
    const data = (await res.json()) as Hub;
    setHub(data);
    setRetro({
      what_worked: data.retro?.what_worked ?? "",
      what_to_change: data.retro?.what_to_change ?? "",
      cases_that_landed: data.retro?.cases_that_landed ?? "",
      arguments_that_landed: data.retro?.arguments_that_landed ?? "",
      status: data.retro?.status ?? "draft",
    });
    setHandoffBody(data.handoff?.body ?? "");
    setWho(data.handoff?.who_did_what ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveRetro(publish: boolean) {
    if (!hub?.viewer.teamId) return;
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/season/retro", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        team_id: hub.viewer.teamId,
        ...retro,
        status: publish ? "published" : "draft",
        refresh_themes: true,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setMsg("Could not save the retro.");
      return;
    }
    setMsg(publish ? "Retro published." : "Retro saved as draft.");
    await load();
  }

  async function toggleChecklist(id: string, done: boolean) {
    const res = await fetch("/api/season/nationals", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, done }),
    });
    if (!res.ok) {
      setMsg("Could not update the checklist.");
      return;
    }
    await load();
  }

  async function saveHandoff() {
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/season/handoff", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: handoffBody, who_did_what: who }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      setMsg(j.error ?? "Could not save the handoff.");
      return;
    }
    setMsg("Handoff guide saved.");
    await load();
  }

  async function archiveSeason() {
    if (
      !window.confirm(
        "Archive this season as read-only and start a clean next season?",
      )
    ) {
      return;
    }
    setSaving(true);
    const res = await fetch("/api/season/archive", { method: "POST" });
    setSaving(false);
    const j = (await res.json()) as {
      message?: string;
      error?: string;
      downloadPath?: string | null;
    };
    if (!res.ok) {
      setMsg(j.error ?? "Archive failed.");
      return;
    }
    setMsg(
      j.downloadPath
        ? `${j.message ?? "Archived."} Download: ${j.downloadPath}`
        : (j.message ?? "Archived."),
    );
    await load();
  }

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-sm text-cardinal">{error}</p>
      </main>
    );
  }

  if (!hub) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-sm text-muted">Loading season.</p>
      </main>
    );
  }

  const isAdmin =
    hub.viewer.role === "tech_admin" || hub.viewer.role === "coach_admin";
  const readOnly = hub.archived;

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "results", label: "Results", show: true },
    { id: "retro", label: "Retro", show: true },
    {
      id: "nationals",
      label: "Nationals",
      show: Boolean(hub.myResult?.advanced),
    },
    { id: "archive", label: "Archive", show: true },
    { id: "handoff", label: "Handoff", show: true },
  ];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 pb-24 md:pb-8">
      <header className="space-y-2">
        <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted">
          After the regional
        </p>
        <h1 className="font-display m-0 text-3xl font-extrabold text-ink md:text-4xl">
          {hub.season.label}
        </h1>
        <p className="m-0 text-sm text-muted">
          {hub.archived
            ? "This season is archived and read-only."
            : "Results, retrospective, Nationals prep, and next-year handoff."}
        </p>
        {msg ? <p className="m-0 text-sm text-ink">{msg}</p> : null}
      </header>

      <nav
        className="flex gap-2 overflow-x-auto pb-1"
        aria-label="Season sections"
      >
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "min-h-11 shrink-0 rounded-xl px-4 text-sm font-semibold",
                tab === t.id
                  ? "bg-ink text-white"
                  : "bg-white text-ink ring-1 ring-[var(--crux-line)]",
              )}
            >
              {t.label}
            </button>
          ))}
      </nav>

      {tab === "results" ? (
        <section className="space-y-4 rounded-[20px] bg-white p-5">
          <h2 className="font-display m-0 text-xl font-extrabold">
            How each team did
          </h2>
          <p className="m-0 text-sm text-muted">
            Entered by Dr. B or Jainam from real rounds. Never invented.
          </p>
          {hub.results.length === 0 ? (
            <p className="m-0 text-sm text-muted">
              No team results yet.{" "}
              {isAdmin ? (
                <Link
                  href="/admin/competition"
                  className="font-semibold text-cardinal underline"
                >
                  Log rounds and enter results
                </Link>
              ) : (
                "Ask Dr. B or Jainam to enter them."
              )}
            </p>
          ) : (
            <ul className="m-0 list-none space-y-3 p-0">
              {hub.teams.map((team) => {
                const r = hub.results.find((x) => x.team_id === team.id);
                return (
                  <li
                    key={team.id}
                    className="rounded-2xl border border-[var(--crux-line)] p-4"
                  >
                    <p className="m-0 font-semibold text-ink">{team.name}</p>
                    {r ? (
                      <p className="m-0 mt-1 text-sm text-muted">
                        {r.rounds_played} rounds: {r.wins} win
                        {r.wins === 1 ? "" : "s"}, {r.losses} loss
                        {r.losses === 1 ? "" : "es"}
                        {r.ties ? `, ${r.ties} tie${r.ties === 1 ? "" : "s"}` : ""}
                        {r.advanced
                          ? `. Advanced${r.advancement_note ? `: ${r.advancement_note}` : ""}`
                          : ""}
                      </p>
                    ) : (
                      <p className="m-0 mt-1 text-sm text-muted">
                        Not entered yet.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {hub.teamLogs.length > 0 ? (
            <div className="space-y-2 border-t border-[var(--crux-line)] pt-4">
              <h3 className="font-display m-0 text-lg font-extrabold">
                Your team&apos;s rounds
              </h3>
              {hub.teamLogs.map((l) => (
                <article
                  key={l.id}
                  className="rounded-2xl bg-[var(--crux-paper)] p-3 text-sm"
                >
                  <p className="m-0 font-semibold">
                    vs {l.opponent}
                    {l.case_number != null ? ` (Case ${l.case_number})` : ""}
                  </p>
                  <p className="m-0 text-muted">
                    {l.score_us ?? "-"} to {l.score_them ?? "-"}
                    {l.result ? `, ${l.result}` : ""}
                  </p>
                  {l.judge_comments ? (
                    <p className="m-0 mt-2 text-ink">{l.judge_comments}</p>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}
          {isAdmin ? (
            <Link
              href="/admin/competition"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-cardinal underline"
            >
              Admin: log rounds and team results
            </Link>
          ) : null}
        </section>
      ) : null}

      {tab === "retro" ? (
        <section className="space-y-4 rounded-[20px] bg-white p-5">
          <h2 className="font-display m-0 text-xl font-extrabold">
            Team retrospective
          </h2>
          <p className="m-0 text-sm text-muted">
            What worked, what to change, which cases and arguments landed.
            Judge comments are grouped into themes with citations.
          </p>
          {(
            [
              ["what_worked", "What worked"],
              ["what_to_change", "What to change"],
              ["cases_that_landed", "Cases that landed"],
              ["arguments_that_landed", "Arguments that landed"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                {label}
              </span>
              <textarea
                className="min-h-24 w-full rounded-xl border border-[var(--crux-line)] bg-[var(--crux-paper)] p-3 text-sm"
                value={retro[key]}
                disabled={readOnly}
                onChange={(e) =>
                  setRetro((r) => ({ ...r, [key]: e.target.value }))
                }
              />
            </label>
          ))}
          {!readOnly ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={saving}
                onClick={() => void saveRetro(false)}
              >
                Save draft
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => void saveRetro(true)}
              >
                Publish and refresh themes
              </Button>
            </div>
          ) : null}
          {hub.themes.length > 0 ? (
            <div className="space-y-3 border-t border-[var(--crux-line)] pt-4">
              <h3 className="font-display m-0 text-lg font-extrabold">
                Themes from judge comments
              </h3>
              {hub.themes.map((t) => (
                <article
                  key={t.id}
                  className="rounded-2xl border border-[var(--crux-line)] p-4"
                >
                  <p className="m-0 font-semibold text-ink">{t.theme}</p>
                  <p className="m-0 mt-1 text-sm text-muted">{t.summary}</p>
                  <ul className="mt-2 space-y-2 pl-4 text-xs text-ink">
                    {t.citation_quotes.map((q, i) => (
                      <li key={`${t.id}-${i}`}>
                        “{q.quote}”
                        <span className="text-muted">
                          {" "}
                          (vs {q.opponent}
                          {q.case_number != null
                            ? `, Case ${q.case_number}`
                            : ""}
                          )
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          ) : (
            <p className="m-0 text-sm text-muted">
              Publish the retro to group real judge comments into themes. Empty
              if no comments are logged yet.
            </p>
          )}
        </section>
      ) : null}

      {tab === "nationals" ? (
        <section className="space-y-4 rounded-[20px] bg-white p-5">
          <h2 className="font-display m-0 text-xl font-extrabold">
            Nationals prep
          </h2>
          <p className="m-0 text-sm text-muted">
            Reuse cases, briefs and weak spots from the regional. Checklist of
            what changes.
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/case-brain" className="font-semibold text-cardinal underline">
              Cases and briefs
            </Link>
            <Link href="/library" className="font-semibold text-cardinal underline">
              Evidence Library
            </Link>
          </div>
          <ul className="m-0 list-none space-y-3 p-0">
            {hub.checklist.map((item) => (
              <li
                key={item.id}
                className="flex gap-3 rounded-2xl border border-[var(--crux-line)] p-4"
              >
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5"
                  checked={item.done}
                  disabled={readOnly}
                  onChange={(e) =>
                    void toggleChecklist(item.id, e.target.checked)
                  }
                  aria-label={item.label}
                />
                <div>
                  <p className="m-0 font-semibold text-ink">{item.label}</p>
                  <p className="m-0 mt-1 text-sm text-muted">{item.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === "archive" ? (
        <section className="space-y-4 rounded-[20px] bg-white p-5">
          <h2 className="font-display m-0 text-xl font-extrabold">
            Season archive
          </h2>
          <p className="m-0 text-sm text-muted">
            Freeze this season&apos;s cases, briefs, evidence and results as
            read-only, then start a new season cleanly.
          </p>
          {hub.archived ? (
            <p className="m-0 text-sm text-ink">
              Archived
              {hub.season.archived_at
                ? ` on ${new Date(hub.season.archived_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                : ""}
              .
            </p>
          ) : hub.viewer.role === "tech_admin" ? (
            <Button
              type="button"
              disabled={saving}
              onClick={() => void archiveSeason()}
            >
              Archive season and start clean
            </Button>
          ) : (
            <p className="m-0 text-sm text-muted">
              Only Jainam can archive the season. Ask him when you are ready.
            </p>
          )}
        </section>
      ) : null}

      {tab === "handoff" ? (
        <section className="space-y-4 rounded-[20px] bg-white p-5">
          <h2 className="font-display m-0 text-xl font-extrabold">
            Handoff for next year
          </h2>
          <p className="m-0 text-sm text-muted">
            Editable what-we-learned guide and who did what, so new members
            inherit the knowledge.
          </p>
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              What we learned
            </span>
            <textarea
              className="min-h-40 w-full rounded-xl border border-[var(--crux-line)] bg-[var(--crux-paper)] p-3 text-sm"
              value={handoffBody}
              disabled={!isAdmin || (readOnly && hub.viewer.role !== "tech_admin")}
              onChange={(e) => setHandoffBody(e.target.value)}
            />
          </label>
          <div className="space-y-3">
            <h3 className="font-display m-0 text-lg font-extrabold">
              Who did what
            </h3>
            {who.map((row, idx) => (
              <div
                key={`${row.person_name}-${idx}`}
                className="grid gap-2 rounded-2xl border border-[var(--crux-line)] p-3 sm:grid-cols-2"
              >
                <p className="m-0 text-sm font-semibold sm:col-span-2">
                  {row.person_name}{" "}
                  <span className="font-normal text-muted">({row.role})</span>
                </p>
                <label className="block text-xs">
                  Cases
                  <input
                    className="mt-1 w-full rounded-lg border border-[var(--crux-line)] bg-[var(--crux-paper)] px-3 py-2 text-sm"
                    value={row.cases}
                    disabled={!isAdmin}
                    onChange={(e) => {
                      const next = [...who];
                      next[idx] = { ...row, cases: e.target.value };
                      setWho(next);
                    }}
                  />
                </label>
                <label className="block text-xs">
                  Notes
                  <input
                    className="mt-1 w-full rounded-lg border border-[var(--crux-line)] bg-[var(--crux-paper)] px-3 py-2 text-sm"
                    value={row.notes}
                    disabled={!isAdmin}
                    onChange={(e) => {
                      const next = [...who];
                      next[idx] = { ...row, notes: e.target.value };
                      setWho(next);
                    }}
                  />
                </label>
              </div>
            ))}
          </div>
          {isAdmin ? (
            <Button
              type="button"
              disabled={saving}
              onClick={() => void saveHandoff()}
            >
              Save handoff
            </Button>
          ) : (
            <p className="m-0 text-sm text-muted">
              Members can read this. Dr. B or Jainam edit it.
            </p>
          )}
        </section>
      ) : null}
    </main>
  );
}
